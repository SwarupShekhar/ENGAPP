import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressClient } from 'livekit-server-sdk';
import { EncodedFileOutput, AzureBlobUpload } from '@livekit/protocol';
import { PrismaService } from '@app/prisma/prisma.service';

/**
 * Starts LiveKit Room Composite Egress (audio-only) for P2P/session recording.
 * Output is written to Azure Blob; egress_ended webhook will download → Azure Speech → transcript → AI feedback.
 */
@Injectable()
export class EgressService {
  private readonly logger = new Logger(EgressService.name);
  private readonly egressClient: EgressClient | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const host = this.config.get<string>('LIVEKIT_HOST');
    const key = this.config.get<string>('LIVEKIT_API_KEY');
    const secret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!host || !key || !secret) {
      this.logger.warn('LiveKit not configured; egress disabled');
      this.egressClient = null;
    } else {
      this.egressClient = new EgressClient(host, key, secret);
    }
  }

  /**
   * Start audio-only room composite egress to Azure Blob. Stores egressId on the session.
   * Requires AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY, and container (LIVEKIT_EGRESS_AZURE_CONTAINER or recordings).
   */
  async startRoomCompositeEgress(
    roomName: string,
    sessionId: string,
  ): Promise<string | null> {
    if (!this.egressClient) {
      this.logger.warn('Egress client not configured');
      return null;
    }

    const accountName =
      this.config.get<string>('AZURE_STORAGE_ACCOUNT_NAME') ??
      this.config.get<string>('LIVEKIT_EGRESS_AZURE_ACCOUNT_NAME');
    const accountKey =
      this.config.get<string>('AZURE_STORAGE_ACCOUNT_KEY') ??
      this.config.get<string>('LIVEKIT_EGRESS_AZURE_ACCOUNT_KEY');
    const containerName =
      this.config.get<string>('LIVEKIT_EGRESS_AZURE_CONTAINER') ??
      this.config.get<string>('AZURE_STORAGE_CONTAINER') ??
      'recordings';

    if (!accountName || !accountKey) {
      this.logger.warn(
        'Azure Blob not configured for egress (AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY); skipping egress',
      );
      return null;
    }

    const filepath = `recordings/${sessionId}.mp4`;
    // Protocol types are protobuf Message classes; pass plain object at runtime
    const azureUpload = {
      accountName,
      accountKey,
      containerName,
    } as unknown as AzureBlobUpload;

    const fileOutput = {
      filepath,
      output: { case: 'azure' as const, value: azureUpload },
    } as unknown as EncodedFileOutput;

    try {
      const info = await this.egressClient.startRoomCompositeEgress(
        roomName,
        fileOutput,
        { audioOnly: true },
      );
      const egressId = info?.egressId;
      if (!egressId) {
        this.logger.warn('Egress started but no egressId in response');
        return null;
      }

      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: { egressId },
      });

      this.logger.log(
        `Egress started session=${sessionId} egressId=${egressId} filepath=${filepath}`,
      );
      return egressId;
    } catch (e) {
      this.logger.error(
        `startRoomCompositeEgress failed session=${sessionId}`,
        e,
      );
      return null;
    }
  }

  /**
   * Start track composite egress for a specific participant's audio.
   * Stores the participant's egressId on the SessionParticipant.
   */
  async startParticipantTrackEgress(
    roomName: string,
    sessionId: string,
    participantIdentity: string,
    userId: string,
  ): Promise<string | null> {
    if (!this.egressClient) return null;

    const accountName =
      this.config.get<string>('AZURE_STORAGE_ACCOUNT_NAME') ??
      this.config.get<string>('LIVEKIT_EGRESS_AZURE_ACCOUNT_NAME');
    const accountKey =
      this.config.get<string>('AZURE_STORAGE_ACCOUNT_KEY') ??
      this.config.get<string>('LIVEKIT_EGRESS_AZURE_ACCOUNT_KEY');
    const containerName =
      this.config.get<string>('LIVEKIT_EGRESS_AZURE_CONTAINER') ??
      this.config.get<string>('AZURE_STORAGE_CONTAINER') ??
      'recordings';

    if (!accountName || !accountKey) return null;

    const filepath = `recordings/${sessionId}_${userId}.mp4`;

    const azureUpload = {
      accountName,
      accountKey,
      containerName,
    } as unknown as AzureBlobUpload;

    const fileOutput = {
      filepath,
      output: { case: 'azure' as const, value: azureUpload },
    } as unknown as EncodedFileOutput;

    try {
      const info = await this.egressClient.startTrackCompositeEgress(
        roomName,
        fileOutput,
        { audioTrackId: participantIdentity },
      );

      const egressId = info?.egressId;
      if (!egressId) return null;

      await this.prisma.sessionParticipant.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: { participantEgressId: egressId } as any,
      });

      this.logger.log(
        `Track egress started session=${sessionId} user=${userId} egressId=${egressId}`,
      );
      return egressId;
    } catch (e) {
      this.logger.error(
        `startParticipantTrackEgress failed session=${sessionId} user=${userId}`,
        e,
      );
      return null;
    }
  }
}
