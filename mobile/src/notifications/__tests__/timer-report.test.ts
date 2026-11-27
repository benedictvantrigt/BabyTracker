import { errorText, withTimeout } from '../timer-report';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes on a value that comes in time', async () => {
    await expect(withTimeout(Promise.resolve(3), 1000, 'Counting')).resolves.toBe(3);
  });

  it('passes on an error that comes in time', async () => {
    const failing = Promise.reject(new Error('refused'));
    await expect(withTimeout(failing, 1000, 'Counting')).rejects.toThrow('refused');
  });

  it('gives up on a promise that never settles', async () => {
    const result = withTimeout(new Promise<never>(() => {}), 5000, 'Updating the Live Activity');
    jest.advanceTimersByTime(5000);
    await expect(result).rejects.toThrow('Updating the Live Activity did not finish within 5 s');
  });
});

describe('errorText', () => {
  it('says so when an error has no message', () => {
    expect(errorText(new Error(''))).toBe('no reason given');
    expect(errorText('refused')).toBe('refused');
  });
});
