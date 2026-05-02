import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushyService } from './pushy.service';
import axios from 'axios';

jest.mock('axios');
const mockedPost = axios.post as jest.MockedFunction<typeof axios.post>;

describe('PushyService', () => {
  let service: PushyService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PushyService,
        { provide: ConfigService, useValue: { get: () => 'test-api-key' } },
      ],
    }).compile();
    service = module.get(PushyService);
  });

  afterEach(() => jest.clearAllMocks());

  it('sends to all tokens and returns results', async () => {
    mockedPost.mockResolvedValue({ data: { success: true } });

    const results = await service.send(['tok1', 'tok2'], {
      title: 'Hello',
      body: 'World',
      data: { type: 'reminder' },
    });

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { token: 'tok1', success: true },
      { token: 'tok2', success: true },
    ]);
  });

  it('marks failed tokens without throwing', async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { success: true } })
      .mockRejectedValueOnce(new Error('network error'));

    const results = await service.send(['tok1', 'tok2'], {
      title: 'Hi',
      body: 'Hey',
      data: {},
    });

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe('network error');
  });

  it('flags invalid tokens so caller can purge them', async () => {
    mockedPost.mockRejectedValue({
      response: { data: { error: 'DeviceNotRegistered' } },
      message: 'Request failed',
    });

    const results = await service.send(['dead-token'], {
      title: 'Hi',
      body: '',
      data: {},
    });

    expect(results[0].invalidToken).toBe(true);
  });
});
