import { Controller, Post, Body, Logger } from '@nestjs/common';
import { LivekitService } from './livekit.service';
import { EgressService } from './egress.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Controller('livekit')
export class LivekitController {
  private readonly logger = new Logger(LivekitController.name);

  constructor(
    private readonly livekitService: LivekitService,
    private readonly egressService: EgressService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('token')
  async getToken(@Body() body: { userId: string; sessionId: string }) {
    const roomName = `room_${body.sessionId}`;
    this.logger.log(
      `Token requested: clerkId=${body.userId} sessionId=${body.sessionId} room=${roomName}`,
    );

    // body.userId is the Clerk ID (e.g. "user_3ACm61sb...") — used as LiveKit participant identity
    const token = await this.livekitService.generateToken(
      roomName,
      body.userId,
    );

    // Resolve Clerk ID → internal UUID so we can match SessionParticipant records
    const dbUser = await this.prisma.user.findFirst({
      where: { clerkId: body.userId },
      select: { id: true },
    });

    if (!dbUser) {
      this.logger.warn(
        `No DB user found for clerkId=${body.userId}; egress will not start`,
      );
      return { token, roomName };
    }

    const internalUserId = dbUser.id;
    this.logger.log(
      `Resolved clerkId=${body.userId} → userId=${internalUserId}`,
    );

    const session = await this.prisma.conversationSession.findUnique({
      where: { id: body.sessionId },
      include: { participants: true },
    });

    if (session) {
      // Room composite — start only once, with a small delay so the room exists
      if (!session.egressId) {
        setTimeout(async () => {
          try {
            const result =
              await this.prisma.conversationSession.updateMany({
                where: { id: body.sessionId, egressId: null },
                data: { egressId: 'pending' },
              });

            if (result.count > 0) {
              this.logger.log(
                `Starting room composite egress for session=${body.sessionId}`,
              );
              try {
                await this.egressService.startRoomCompositeEgress(
                  roomName,
                  body.sessionId,
                );
              } catch (e) {
                this.logger.error(
                  `Room composite egress failed for session ${body.sessionId}`,
                  e,
                );
                await this.prisma.conversationSession.updateMany({
                  where: { id: body.sessionId, egressId: 'pending' },
                  data: { egressId: null },
                });
              }
            }
          } catch (e) {
            this.logger.error(
              `Room composite egress scheduling failed for session ${body.sessionId}`,
              e,
            );
          }
        }, 3000);
      }

      // Per-participant egress — records each user's audio separately for pronunciation assessment
      const thisParticipant = session.participants.find(
        (p) => p.userId === internalUserId,
      );
      if (thisParticipant && !thisParticipant.participantEgressId) {
        this.logger.log(
          `Scheduling participant egress for internalUserId=${internalUserId} clerkId=${body.userId} session=${body.sessionId}`,
        );
        setTimeout(async () => {
          try {
            const placeholderEgressId = `pending_${body.sessionId}_${internalUserId}`;

            const claimResult =
              await this.prisma.sessionParticipant.updateMany({
                where: {
                  sessionId: body.sessionId,
                  userId: internalUserId,
                  participantEgressId: null,
                },
                data: { participantEgressId: placeholderEgressId },
              });

            if (claimResult.count > 0) {
              this.logger.log(
                `Starting participant egress: internalUserId=${internalUserId} identity=${body.userId} room=${roomName}`,
              );
              try {
                // identity = Clerk ID (what LiveKit knows the participant as)
                // userId = internal UUID (for DB lookups and file paths)
                await this.egressService.startParticipantTrackEgress(
                  roomName,
                  body.sessionId,
                  body.userId,
                  internalUserId,
                );
              } catch (e) {
                this.logger.error(
                  `Participant egress failed for user ${internalUserId} in session ${body.sessionId}`,
                  e,
                );
                await this.prisma.sessionParticipant.updateMany({
                  where: {
                    sessionId: body.sessionId,
                    userId: internalUserId,
                    participantEgressId: placeholderEgressId,
                  },
                  data: { participantEgressId: null },
                });
              }
            }
          } catch (e) {
            this.logger.error(
              `Participant egress scheduling failed for user ${internalUserId} in session ${body.sessionId}`,
              e,
            );
          }
        }, 5000);
      } else if (thisParticipant) {
        this.logger.log(
          `Participant egress already started for userId=${internalUserId} egressId=${thisParticipant.participantEgressId}`,
        );
      } else {
        this.logger.warn(
          `No SessionParticipant found for userId=${internalUserId} in session=${body.sessionId}. Participants: ${session.participants.map(p => p.userId).join(', ')}`,
        );
      }
    }

    return { token, roomName };
  }
}
