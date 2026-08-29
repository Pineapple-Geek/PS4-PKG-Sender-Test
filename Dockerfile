FROM node:20-slim as build

WORKDIR /pkg_sender

COPY package.json package.json
RUN npm install

FROM node:20-slim

RUN apt update && apt install -y curl

COPY --from=build /pkg_sender /
COPY src src

CMD ["npm", "start"]