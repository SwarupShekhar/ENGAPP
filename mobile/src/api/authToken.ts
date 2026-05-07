let _token: string | null = null;
let _expiry = 0;

export const getCachedToken = async (
  fetcher: () => Promise<string | null>,
): Promise<string | null> => {
  if (_token && Date.now() < _expiry - 5000) return _token;
  _token = await fetcher();
  _expiry = Date.now() + 55000;
  return _token;
};

export const invalidateCachedToken = (): void => {
  _token = null;
  _expiry = 0;
};
