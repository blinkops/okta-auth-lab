import { issuer } from "@openauthjs/openauth";
import { OidcProvider } from "@openauthjs/openauth/provider/oidc";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

// Subjects schema definition
const subjects = createSubjects({
  user: object({
    id: string(),
    email: string(),
  }),
});

// OpenAuth Issuer configuration
const authIssuer = issuer({
  storage: CloudflareStorage({
    namespace: env.AUTH_STORAGE,
  }),
  subjects,
  providers: {
    oidc: OidcProvider({
      clientId: "0oanvl3l21qj8Q7uI5d7", // Your actual Okta client ID
      issuer: "https://dev-87536712.okta.com/oauth2/default", // Your Okta issuer URL
      scopes: ["openid", "profile", "email"],
    }),
  },
  theme: {
    title: "My Auth App",
    primary: "#0051c3",
    favicon: "https://workers.cloudflare.com/favicon.ico",
    logo: {
      dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
      light: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
    },
  },
  success: async (ctx, value) => {
    return ctx.subject("user", {
      id: await getOrCreateUser(env, value.email),
      email: value.email,
    });
  },
});

// Main Cloudflare Worker fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return authIssuer.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

// User management (database integration)
async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const result = await env.AUTH_DB.prepare(
    `
    INSERT INTO user (email)
    VALUES (?)
    ON CONFLICT (email) DO UPDATE SET email = email
    RETURNING id;
    `,
  )
    .bind(email)
    .first<{ id: string }>();

  if (!result) {
    throw new Error(`Unable to process user: ${email}`);
  }

  console.log(`Found or created user ${result.id} with email ${email}`);
  return result.id;
}
