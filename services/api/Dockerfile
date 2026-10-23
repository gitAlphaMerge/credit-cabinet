FROM golang:alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./
RUN CGO_ENABLED=0 go build -o /bin/api main.go

FROM alpine:3.20

COPY --from=build /bin/api /bin/api

ENTRYPOINT ["/bin/api"]
