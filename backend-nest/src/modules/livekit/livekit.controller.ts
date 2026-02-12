import { Controller, Post, Body } from '@nestjs/common';
import { LivekitService } from './livekit.service';

@Controller('livekit')
export class LivekitController {
    constructor(private livekitService: LivekitService) { }

    @Post('token')
    async getToken(@Body() body: { userId: string; sessionId: string }) {
        const roomName = `room_${body.sessionId}`;
        const token = await this.livekitService.generateToken(roomName, body.userId);
        return { token, roomName };
    }
}
