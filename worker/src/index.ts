import { createApp } from "./backend/app";
import { CleanupService } from "./backend/services/cleanup-service";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    await new CleanupService(env).pruneEvents();
  },
};

export { app };
