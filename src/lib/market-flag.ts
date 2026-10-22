// zyr approved server-proxied use of loa-buddy's feed (reported 2026-10-22). Set PUBLIC_MARKET_PRICES=0 to
// switch it off immediately without a code change. Public because the price dialog needs it too; it isn't a secret.
import { env } from '$env/dynamic/public';

export const marketPricesEnabled = () => env.PUBLIC_MARKET_PRICES !== '0';
