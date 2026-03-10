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
      // Start room composite only once (mixed recording for Brain)
      if (!session.egressId) {
        try {
          this.logger.log(
            `Starting room composite egress for session ${session.id}`,
          );
          await this.egressService.startRoomCompositeEgress(
            roomName,
            body.sessionId,
          );
        } catch (e) {
          this.logger.error(
            `Failed to start room composite egress for session ${session.id}`,
            e,
          );
        }
      }

      // Start track egress for THIS participant only (pronunciation)
      // Gate on participantEgressId so we never start twice for the same person
      const thisParticipant = session.participants.find(
        (p) => p.userId === body.userId,
      );

      if (thisParticipant && !thisParticipant.participantEgressId) {
        try {
          this.logger.log(
            `Starting track egress for participant ${body.userId} session ${session.id}`,
          );
          await this.egressService.startParticipantTrackEgress(
            roomName,
            body.sessionId,
            body.userId,
            body.userId,
          );
        } catch (e) {
          this.logger.error(
            `Failed to start track egress for participant ${body.userId}`,
            e,
          );
        }
      }
    }

    return { token, roomName };
  }
}
