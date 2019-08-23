const { Vpath } = require('.');

async function main() {
  const root = await Vpath.getHome();
  console.debug(`${root}`);

  const children = await root.getRoute();
  children.forEach((child) => {
    console.debug(`  ${child}`);
  })
}

main().catch(console.error);
