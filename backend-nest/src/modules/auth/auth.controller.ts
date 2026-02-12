import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UseGuards,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ClerkGuard } from './clerk.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) { }

  @UseGuards(ClerkGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    try {
      const user = await this.authService.validateUser(req.user.clerkId);
      return {
        statusCode: HttpStatus.OK,
        message: 'Profile retrieved successfully',
        data: user,
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to retrieve profile',
        error: error.message,
      };
    }
  }

  @UseGuards(ClerkGuard)
  @Get('me')
  async getCurrentUser(@Request() req) {
    try {
      const user = await this.authService.validateUser(req.user.clerkId);
      return {
        statusCode: HttpStatus.OK,
        message: 'User retrieved successfully',
        data: user,
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to retrieve user',
        error: error.message,
      };
    }
  }

  @Post('register')
  async registerUser(@Body() userData: any) {
    try {
      // In a real implementation, you would validate the data properly
      const user = await this.authService.createUser({
        clerkId: userData.clerkId,
        fname: userData.firstName,
        lname: userData.lastName,
        gender: userData.gender,
        hobbies: userData.hobbies || [],
        nativeLang: userData.nativeLang || 'english',
        level: userData.level || 'beginner',
      });

      return {
        statusCode: HttpStatus.CREATED,
        message: 'User registered successfully',
        data: user,
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to register user',
        error: error.message,
      };
    }
  }

  @Post('webhook')
  async clerkWebhook(@Body() body: any) {
    try {
      this.logger.log('Received Clerk webhook');
      // Logic to handle Clerk events (user.created, user.updated)
      // This would use authService.createUser or similar logic
      return { status: 'handled' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  @Get('health')
  async healthCheck() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Auth service is healthy',
      timestamp: new Date().toISOString(),
    };
  }
}