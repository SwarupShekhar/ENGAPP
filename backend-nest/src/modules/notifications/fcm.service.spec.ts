import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FcmService } from './fcm.service';

const sendEachForMulticast = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn((value) => value) },
  messaging: () => ({
    sendEachForMulticast,
  }),
}));

describe('FcmService', () => {
  let service: FcmService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (admin as { apps: unknown[] }).apps = [];

    const module = await Test.createTestingModule({
      providers: [
        FcmService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'FIREBASE_SERVICE_ACCOUNT_JSON'
                ? JSON.stringify({
                    project_id: 'mobapp-7a5e6',
                    client_email: 'firebase-adminsdk@test.iam.gserviceaccount.com',
                    private_key: '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n',
                  })
                : undefined,
          },
        },
      ],
    }).compile();

    service = module.get(FcmService);
    service.onModuleInit();
  });

  it('sends to all tokens and returns results', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });

    const results = await service.send(['tok1', 'tok2'], {
      title: 'Hello',
      body: 'World',
      data: { type: 'reminder' },
    });

    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { token: 'tok1', success: true },
      { token: 'tok2', success: true },
    ]);
  });

  it('marks invalid tokens without throwing', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true },
        {
          success: false,
          error: {
            code: 'messaging/registration-token-not-registered',
            message: 'not registered',
          },
        },
      ],
    });

    const results = await service.send(['tok1', 'tok2'], {
      title: 'Hi',
      body: 'Hey',
      data: {},
    });

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].invalidToken).toBe(true);
  });
});
