FROM docker.io/library/python:3.13-alpine
RUN apk add --no-cache tzdata && addgroup -g 10001 antscoper && adduser -D -u 10001 -G antscoper antscoper
WORKDIR /app
COPY worker/ ./worker/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SCHEDULE_ROOT=/var/lib/antscoper TZ=America/Los_Angeles
USER 10001:10001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD python -m worker health
ENTRYPOINT ["python", "-m", "worker"]
CMD ["serve"]
