import {
  Controller,
  Post,
  Body,
  Logger,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LivekitService } from './livekit.service';
import { EgressService } from './egress.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('livekit')
@UseGuards(ClerkGuard)
export class LivekitController {
  private readonly logger = new Logger(LivekitController.name);

  constructor(
    private readonly livekitService: LivekitService,
    private readonly egressService: EgressService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('token')
  async getToken(
    @Request() req: { user: { id: string; clerkId: string } },
    @Body() body: { sessionId: string; userId?: string },
  ) {
    if (body.userId && body.userId !== req.user.clerkId) {
      throw new ForbiddenException('userId does not match authenticated user');
    }

    const clerkId = req.user.clerkId;
    const roomName = `room_${body.sessionId}`;
    this.logger.log(
      `Token requested: clerkId=${clerkId} sessionId=${body.sessionId} room=${roomName}`,
    );

    const session = await this.prisma.conversationSession.findUnique({
      where: { id: body.sessionId },
      include: { participants: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const isParticipant = session.participants.some(
      (p) => p.userId === req.user.id,
    );
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant in this session');
    }

    const token = await this.livekitService.generateToken(roomName, clerkId);
    const internalUserId = req.user.id;

    // Room composite — start only once, with a small delay so the room exists
    if (!session.egressId) {
      setTimeout(async () => {
        try {
          const result = await this.prisma.conversationSession.updateMany({
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

    const thisParticipant = session.participants.find(
      (p) => p.userId === internalUserId,
    );
    if (thisParticipant && !thisParticipant.participantEgressId) {
      this.logger.log(
        `Scheduling participant egress for internalUserId=${internalUserId} clerkId=${clerkId} session=${body.sessionId}`,
      );
      setTimeout(async () => {
        try {
          const placeholderEgressId = `pending_${body.sessionId}_${internalUserId}`;

          const claimResult = await this.prisma.sessionParticipant.updateMany({
            where: {
              sessionId: body.sessionId,
              userId: internalUserId,
              participantEgressId: null,
            },
            data: { participantEgressId: placeholderEgressId },
          });

          if (claimResult.count > 0) {
            this.logger.log(
              `Starting participant egress: internalUserId=${internalUserId} identity=${clerkId} room=${roomName}`,
            );
            try {
              await this.egressService.startParticipantTrackEgress(
                roomName,
                body.sessionId,
                clerkId,
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
    }

    return { token, roomName };
  }
}
