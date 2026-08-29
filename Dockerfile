FROM node:20-slim

WORKDIR /pkg_sender

COPY package.json package.json
RUN npm install
RUN apk --no-cache add curl

COPY --from=build /pkg_sender /
COPY src src

CMD ["npm", "start"]
