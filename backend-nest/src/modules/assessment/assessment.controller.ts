import { Controller, Post, Body, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { SubmitPhaseDto } from './dto/assessment.dto';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('assessment')
@UseGuards(ClerkGuard)
export class AssessmentController {
    constructor(private readonly assessmentService: AssessmentService) { }

    @Post('start')
    async start(@Request() req) {
        return this.assessmentService.startAssessment(req.user.id);
    }

    @Post('submit')
    async submit(@Body() dto: SubmitPhaseDto) {
        return this.assessmentService.submitPhase(dto);
    }

    @Get('dashboard')
    async getDashboard(@Request() req) {
        return this.assessmentService.getDashboardData(req.user.id);
    }

    @Get(':id/results')
    async getResults(@Param('id') id: string) {
        return this.assessmentService.getResults(id);
    }
}

