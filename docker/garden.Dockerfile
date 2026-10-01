# Сервер мини-игры (garden/backend): один бинарь и один SQLite-файл, см. garden/README.md.
# modernc.org/sqlite — чистый Go, CGO не нужен, значит собирается в alpine без gcc.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY garden/backend/go.mod garden/backend/go.sum ./
RUN go mod download
COPY garden/backend/ ./
RUN CGO_ENABLED=0 go build -o /out/garden-server .

FROM alpine:3
COPY --from=build /out/garden-server /usr/local/bin/garden-server
RUN mkdir -p /data
EXPOSE 8080
ENTRYPOINT ["garden-server"]
CMD ["-addr", ":8080", "-db", "/data/garden.db"]
