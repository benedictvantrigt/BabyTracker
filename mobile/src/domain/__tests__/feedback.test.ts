import { feedbackMailto } from '../feedback';

describe('feedbackMailto', () => {
  it('fills in the subject and the phone details', () => {
    const url = feedbackMailto('info@example.com', {
      version: '0.14.0',
      platform: 'ios',
      osVersion: '26.1',
      model: 'iPhone 16',
    });
    const [address, query] = url.split('?');
    expect(address).toBe('mailto:info@example.com');
    const params = new URLSearchParams(query);
    expect(params.get('subject')).toBe('Feedback on Napchime 0.14.0');
    expect(params.get('body')).toBe('\n\n\n---\nNapchime 0.14.0\niPhone 16, ios 26.1');
  });

  it('leaves out what is unknown', () => {
    const url = feedbackMailto('a@b.c', {
      version: null,
      platform: 'android',
      osVersion: null,
      model: null,
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('subject')).toBe('Feedback on Napchime');
    expect(params.get('body')).toBe('\n\n\n---\nNapchime\nandroid');
  });

  it('encodes spaces as %20, not +, which mail apps show literally', () => {
    const ctx = { version: '1', platform: 'ios', osVersion: null, model: null };
    const url = feedbackMailto('a@b.c', ctx);
    expect(url).not.toContain('+');
  });
});
