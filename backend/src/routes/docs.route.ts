import { Router } from "express";
import swaggerUi from "swagger-ui-express";

import openApiSpec from "../openapi.json" with { type: "json" };

export const docsRouter = Router();

docsRouter.use("/", swaggerUi.serve);
docsRouter.get("/", swaggerUi.setup(openApiSpec, {
  customSiteTitle: "Food For You API Docs",
  swaggerOptions: {
    persistAuthorization: true,
    tryItOutEnabled: true,
  },
}));

docsRouter.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});
