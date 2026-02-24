
const strapiFactory = require('@strapi/strapi');

async function generateToken() {
  const strapi = await strapiFactory.createStrapi().load();
  try {
    const token = await strapi.service('admin::api-token').create({
      name: 'Backend-Integration-' + Date.now(),
      type: 'full-access',
      lifespan: null,
    });
    console.log('NEW_STRAPI_TOKEN');
    console.log(token.accessKey);
    console.log('END_TOKEN');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

generateToken();
