import { getPortfolioPayload, PORTFOLIO_CACHE_CONTROL } from '../../server/cloudinary-portfolio.js';

const getPortfolioErrorMessage = (locale) =>
  locale === 'en'
    ? 'An error occurred while loading the Cloudinary portfolio.'
    : 'Une erreur est survenue lors du chargement du portfolio Cloudinary.';

export const handler = async (event) => {
  try {
    const locale = event.queryStringParameters?.locale || undefined;
    const root = event.queryStringParameters?.root || undefined;
    const version = event.queryStringParameters?.v || undefined;
    const payload = await getPortfolioPayload(root, locale, version);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': PORTFOLIO_CACHE_CONTROL,
      },
      body: JSON.stringify(payload),
    };
  } catch (error) {
    const locale = event.queryStringParameters?.locale || undefined;

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        error: 'portfolio_api_error',
        message: error instanceof Error ? error.message : getPortfolioErrorMessage(locale),
      }),
    };
  }
};
