FROM node:24-bookworm-slim
WORKDIR /runner
# Deliberately separate from the application dependency tree. No secrets or app files.
RUN npm install --ignore-scripts --omit=dev --no-audit --no-fund --save-exact mockjs@1.1.0 underscore@1.13.8 crypto-js@4.2.0 jsrsasign@11.1.5 && npm cache clean --force
COPY worker.js protocol.js ./
USER 65532:65532
CMD ["node", "--max-old-space-size=64", "/runner/worker.js"]
