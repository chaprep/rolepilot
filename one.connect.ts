import { defineConnectApp } from "@withone/connect/config";

export default defineConnectApp({
  name: "Rolepilot",
  redirectUris: [
    "http://localhost:3000/api/one/callback",
    "http://127.0.0.1:3001/api/one/callback",
  ],
  reason: "Rolepilot can fetch public job postings and search public web pages for cover letter research. It also searches public web pages and LinkedIn profiles for hiring contacts relevant to your applications.",
  ask: {
    exa: {
      access: "custom",
      actions: [
        "conn_mod_def::GLnP1aajcpM::B9YzjETpQGWIsmbugYJXJQ",
        "conn_mod_def::GLnP1SliTjU::cHYbAszDQvC4kJVefjxTMw",
      ],
    },
    muapi: {
      access: "custom",
      actions: [
        "conn_mod_def::GOHdX1CyCBU::T_Nu4bvYTbGwFLYxVGqj8Q",
        "conn_mod_def::GOHdXoYEkLA::ATjYX7nISQy4lx8Y5_LmpA",
        "conn_mod_def::GOHdamPqmxs::eECm4QguSUiKIiQ6pCW4vg",
      ],
    },
  },
});
