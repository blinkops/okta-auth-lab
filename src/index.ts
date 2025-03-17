import { OidcProvider } from "@openauthjs/openauth/provider/oidc";
import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

// Define subjects schema
const subjects = createSubjects({
  user: object({
    id: string(),
  }),
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Debug: Log URL Params to Identify Issues
    console.log("Incoming request:", request.url);

    // OAuth Authorization Redirect
    if (url.pathname === "/") {
      url.searchParams.set("client_id", "0oanvl3l21qj8Q7uI5d7"); // Correct Client ID
      url.searchParams.set("redirect_uri", "https://okta-auth-lab.raz-8d6.workers.dev/oauth2/callback");
      url.searchParams.set("response_type", "code"); // Correct OAuth2 Flow
      url.searchParams.set("scope", "openid profile email");
      url.pathname = "/authorize";

      console.log("Redirecting to:", url.toString());
      return Response.redirect(url.toString());
    } 
    else if (url.pathname === "/callback") {
      console.log("OAuth callback received:", url.searchParams.toString());
      return Response.json({
        message: "OAuth flow complete!",
        params: Object.fromEntries(url.searchParams.entries()),
      });
    }

    // OpenAuth server configuration
    return issuer({
      storage: CloudflareStorage({
        namespace: env.AUTH_STORAGE,
      }),
      subjects,
      providers: {
        password: PasswordProvider(
          PasswordUI({
            sendCode: async (email, code) => {
              console.log(`Sending code ${code} to ${email}`);
            },
            copy: {
              input_code: "Code (check Worker logs)",
            },
          }),
        ),
        oauth2: OidcProvider({
          clientId: "0oanvl3l21qj8Q7uI5d7", // Fixed Client ID
          issuer: "https://dev-87536712.okta.com/oauth2/default", // Ensure this matches Okta settings
          redirectUri: "https://okta-auth-lab.raz-8d6.workers.dev/oauth2/callback",
          responseType: "code", // Ensure correct response type
          scopes: ["openid", "profile", "email"], // Standard OIDC scopes
        }),
      },
      theme: {
        title: "myAuth",
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
        });
      },
    }).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

// Function to create or retrieve user
async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const result = await env.AUTH_DB.prepare(
    `
    INSERT INTO user (email)
    VALUES (?)
    ON CONFLICT (email) DO UPDATE SET email = email
    RETURNING id;
    `
  )
    .bind(email)
    .first<{ id: string }>();

  if (!result) {
    throw new Error(`Unable to process user: ${email}`);
  }

  console.log(`Found or created user ${result.id} with email ${email}`);
  return result.id;
}
