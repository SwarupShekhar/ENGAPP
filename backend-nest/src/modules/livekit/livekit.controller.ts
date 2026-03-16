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
    const token = await this.livekitService.generateToken(
      roomName,
      body.userId,
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
            // Atomically claim egress start to avoid races between concurrent requests
            const result =
              await this.prisma.conversationSession.updateMany({
                where: { id: body.sessionId, egressId: null },
                data: { egressId: 'pending' },
              });

            if (result.count > 0) {
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
              }
            }
          } catch (e) {
            this.logger.error(
              `Room composite egress scheduling failed for session ${body.sessionId}`,
              e,
            );
          }
        }, 3000); // 3 second delay for room to be created
      }

      // Track egress for this participant only
      const thisParticipant = session.participants.find(
        (p) => p.userId === body.userId,
      );
      if (thisParticipant && !thisParticipant.participantEgressId) {
        setTimeout(async () => {
          try {
            // Re-check to avoid race condition
            const updatedSession =
              await this.prisma.conversationSession.findUnique({
                where: { id: body.sessionId },
                include: { participants: true },
              });

            const updatedParticipant = updatedSession?.participants.find(
              (p) => p.userId === body.userId,
            );

            if (updatedParticipant && !updatedParticipant.participantEgressId) {
              try {
                await this.egressService.startParticipantTrackEgress(
                  roomName,
                  body.sessionId,
                  body.userId,
                  body.userId,
                );
              } catch (e) {
                this.logger.error(
                  `Track egress failed for user ${body.userId} in session ${body.sessionId}`,
                  e,
                );
              }
            }
          } catch (e) {
            this.logger.error(
              `Participant egress scheduling failed for user ${body.userId} in session ${body.sessionId}`,
              e,
            );
          }
        }, 3000); // same 3 second delay
      }
    }

    return { token, roomName };
  }
}
