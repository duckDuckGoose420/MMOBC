FROM node:20

COPY ./out/bundle.js* /bot/

WORKDIR /bot/cfg
CMD ["node", "--enable-source-maps", "/bot/bundle.js"]
