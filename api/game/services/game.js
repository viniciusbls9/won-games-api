'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-services)
 * to customize this service
 */

const axios = require('axios');
const slugify = require('slugify')

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getGameInfo(slug) {
  const jsdom = require('jsdom');
  const { JSDOM } = jsdom;
  const body = await axios.get(`https://www.gog.com/game/${slug}`);
  const dom = new JSDOM(body.data);

  const description = dom.window.document.querySelector('.description');

  return {
    rating: 'BR0',
    short_description: description.textContent.slice(0, 160),
    description: description.innerHTML
  }
}

async function getByName(name, entityName) {
  const item = await strapi.services[entityName].find({ name })
  return item.length ? item[0] : null
}

async function create(name, entityName) {
  const item = await getByName(name, entityName)

  if (!item) {
    return await strapi.services[entityName].create({
      name,
      slug: slugify(name, { lower: true })
    })
  }
}

async function createManyToManyData(products) {
  const developers = new Set();
  const publishers = new Set();
  const categories = new Set();
  const platforms = new Set();

  products.forEach((product) => {
    const { developer, publisher, genres, supportedOperatingSystems } = product;

    genres?.forEach((item) => {
      categories.add(item);
    });

    supportedOperatingSystems?.forEach((item) => {
      platforms.add(item);
    });

    developers.add(developer);
    publishers.add(publisher);
  });

  const createCall = (set, entityName) => Array.from(set).map((name) => create(name, entityName));

  return Promise.all([
    ...createCall(developers, "developer"),
    ...createCall(publishers, "publisher"),
    ...createCall(categories, "category"),
    ...createCall(platforms, "platform"),
  ]);
}

async function createGames(products) {
  await Promise.all(
    products.map(async (product) => {
      const item = await getByName(product.title, "game");

      if (!item) {
        console.info(`Creating: ${product.title}...`);

        const game = await strapi.services.game.create({
          name: product.title,
          slug: product.slug.replace(/_/g, "-"),
          price: product.price.amount,
          release_date: new Date(
            Number(product.globalReleaseDate) * 1000
          ).toISOString(),
          categories: await Promise.all(
            product.genres.map((name) => getByName(name, "category"))
          ),
          platforms: await Promise.all(
            product.supportedOperatingSystems.map((name) =>
              getByName(name, "platform")
            )
          ),
          developers: [await getByName(product.developer, "developer")],
          publisher: await getByName(product.publisher, "publisher"),
          ...(await getGameInfo(product.slug)),
        });

        await setImage({ image: product.image, game })
        await Promise.all(
          product.gallery.slice(0, 5).map(url => setImage({ image: url, game, field: "gallery" }))
        )

        await timeout(2000)

        return game;
      }
    })
  );
}

async function setImage({ image, game, field = "cover" }) {
  const url = `https:${image}_bg_crop_1680x655.jpg`;
  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(data, "base64");

  const FormData = require("form-data");
  const formData = new FormData();

  formData.append("refId", game.id);
  formData.append("ref", "game");
  formData.append("field", field);
  formData.append("files", buffer, { filename: `${game.slug}.jpg` });

  console.info(`Uploading ${field} image: ${game.slug}.jpg`);

  await axios({
    method: "POST",
    url: `http://${strapi.config.host}:${strapi.config.port}/upload`,
    data: formData,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
    },
  });
}


module.exports = {
  populate: async (params) => {
    const gogApiUrl = `https://www.gog.com/games/ajax/filtered?mediaType=game&page=1&sort=popularity`

    const { data: { products } } = await axios.get(gogApiUrl)

    // console.log(products[0])

    await createManyToManyData([products[3], products[4]])
    await createGames([products[5], products[8]])

    // await create(products[1].publisher, "publisher")
    // await create(products[1].developer, "developer")

    // console.log(await getGameInfo(products[0].slug))
  }
};
