// The loa-buddy market price import is off unless PUBLIC_MARKET_PRICES=1: it uses loa-buddy's price feed, so it stays
// off until its developer has agreed, and can be switched off again without a code change. Public because the price
// dialog needs it too; it isn't a secret.
import { env } from '$env/dynamic/public';

export const marketPricesEnabled = () => env.PUBLIC_MARKET_PRICES === '1';
