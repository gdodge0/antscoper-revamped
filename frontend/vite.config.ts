import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-schedule-data",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/data/snapshot.json") return next();
          try {
            // A configured runtime directory lets npm run dev exercise live worker
            // output. Otherwise use an explicit development-only demo fixture.
            const runtime = process.env.SCHEDULE_ROOT;
            const data = JSON.parse(
              await readFile(
                runtime
                  ? `${runtime}/public/snapshot.json`
                  : new URL("./fixtures/demo.json", import.meta.url),
                "utf8",
              ),
            );
            if (!runtime) {
              const term = data.metadata.term;
              data.schemaVersion = 2;
              data.metadata = {
                ...data.metadata,
                mode: "demo",
                demoDate: "2026-10-29",
                publicationId: "development-fixture",
                dateRange: { start: "2026-09-20", end: "2026-12-12" },
              };
              data.terms = [
                {
                  id: term,
                  year: "2026",
                  quarter: "Fall",
                  instructionStart: "2026-09-24",
                  instructionEnd: "2026-12-04",
                  finalsStart: "2026-12-05",
                  finalsEnd: "2026-12-11",
                  socAvailable: "2026-05-02",
                },
              ];
              data.rooms = data.rooms.map(
                (r: {
                  id: string;
                  building: string;
                  number: string;
                  schedule: number[][][];
                }) => ({
                  id: r.id,
                  building: r.building,
                  number: r.number,
                  terms: [term],
                  exams: [],
                  uncertainFinals: [term],
                  meetings: r.schedule.flatMap((spans, day) =>
                    spans.map(([start, end]) => ({
                      term,
                      days: [day],
                      start,
                      end,
                    })),
                  ),
                }),
              );
            }
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-cache");
            res.end(JSON.stringify(data));
          } catch {
            res.statusCode = 503;
            res.end('{"error":"Schedule data unavailable"}');
          }
        });
      },
    },
  ],
});
