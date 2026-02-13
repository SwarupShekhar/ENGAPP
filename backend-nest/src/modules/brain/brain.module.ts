import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BrainService } from './brain.service';

@Module({
    imports: [ConfigModule, HttpModule],
    providers: [BrainService],
    exports: [BrainService],
})
export class BrainModule { }
