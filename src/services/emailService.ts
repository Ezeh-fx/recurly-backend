import nodemailer, {
  Transporter,
  SendMailOptions,
  SentMessageInfo,
} from "nodemailer";
import { google } from "googleapis";
import path from "path";
import ejs from "ejs";

import { env } from "../config/env";
import logger from "../config/logger";

interface User {
  email: string;
  otp: string;
  otpExpiresAt: Date;
}

/**
 * ============================================================
 * GOOGLE OAUTH2 CONFIGURATION
 * ============================================================
 */

const GOOGLE_CLIENT_ID = env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = env.GOOGLE_OAUTH_REFRESH_TOKEN;
const GMAIL_USER = env.GMAIL_USER;

const GOOGLE_REDIRECT_URI = "https://developers.google.com/oauthplayground";

if (
  !GOOGLE_CLIENT_ID ||
  !GOOGLE_CLIENT_SECRET ||
  !GOOGLE_REFRESH_TOKEN ||
  !GMAIL_USER
) {
  logger.warn(
    {
      hasClientId: Boolean(GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(GOOGLE_CLIENT_SECRET),
      hasRefreshToken: Boolean(GOOGLE_REFRESH_TOKEN),
      hasGmailUser: Boolean(GMAIL_USER),
    },
    "Gmail OAuth2 environment variables are incomplete",
  );
}

/**
 * Google OAuth2 client
 */
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
);

oauth2Client.setCredentials({
  refresh_token: GOOGLE_REFRESH_TOKEN,
});

/**
 * ============================================================
 * TRANSPORTER
 * ============================================================
 *
 * IMPORTANT:
 * We create ONE transporter and reuse it.
 *
 * Do not create a new transporter every time sendMail()
 * is called.
 */

let transporter: Transporter | null = null;

const createTransporter = (): Transporter => {
  if (transporter) {
    return transporter;
  }

  if (
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_CLIENT_SECRET ||
    !GOOGLE_REFRESH_TOKEN ||
    !GMAIL_USER
  ) {
    throw new Error(
      "Gmail OAuth2 configuration is incomplete. Check GMAIL_USER, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN.",
    );
  }

  transporter = nodemailer.createTransport({
    service: "gmail",

    auth: {
      type: "OAuth2",
      user: GMAIL_USER,
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      refreshToken: GOOGLE_REFRESH_TOKEN,
    },

    /**
     * SMTP connection settings
     */
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,

    /**
     * Keep the SMTP connection alive.
     */
    pool: true,
    maxConnections: 3,
    maxMessages: 100,

    /**
     * Helpful while debugging.
     *
     * Change to false in production if you don't want
     * SMTP debug output.
     */
    logger: env.NODE_ENV === "development",
    debug: env.NODE_ENV === "development",
  });

  return transporter;
};

/**
 * ============================================================
 * SEND MAIL
 * ============================================================
 */

const sendMail = async (
  mailOptions: SendMailOptions,
): Promise<SentMessageInfo> => {
  const mailTransporter = createTransporter();

  try {
    const result = await mailTransporter.sendMail(mailOptions);

    logger.info(
      {
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      },
      "Email sent successfully",
    );

    return result;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        recipient: mailOptions.to,
        subject: mailOptions.subject,
      },
      "Failed to send email",
    );

    throw error;
  }
};

/**
 * ============================================================
 * VERIFY GMAIL CONNECTION
 * ============================================================
 */

export const verifyGmailConnection = async (): Promise<boolean> => {
  try {
    const mailTransporter = createTransporter();

    await mailTransporter.verify();

    logger.info(
      {
        provider: "Gmail",
        authMethod: "OAuth2",
        user: GMAIL_USER,
      },
      "Gmail SMTP connection verified successfully",
    );

    return true;
  } catch (error) {
    const smtpError = error as {
      message?: string;
      code?: string;
      command?: string;
      response?: string;
      responseCode?: number;
    };

    logger.error(
      {
        provider: "Gmail",
        authMethod: "OAuth2",
        user: GMAIL_USER,

        message: smtpError.message,
        code: smtpError.code,
        command: smtpError.command,
        response: smtpError.response,
        responseCode: smtpError.responseCode,

        stack: error instanceof Error ? error.stack : undefined,
      },
      "Gmail SMTP connection verification failed",
    );

    return false;
  }
};

/**
 * ============================================================
 * OTP EMAIL
 * ============================================================
 */

export const sendOtpEmail = async (user: User): Promise<void> => {
  const templatePath = path.join(
    __dirname,
    "../../templates/emails/otp-email.ejs",
  );

  try {
    /**
     * Calculate OTP expiry time.
     */
    const remainingMilliseconds =
      user.otpExpiresAt.getTime() - Date.now();

    const expiryMinutes = Math.max(
      1,
      Math.ceil(remainingMilliseconds / 60_000),
    );

    /**
     * Render email template.
     */
    const html = await ejs.renderFile(templatePath, {
      email: user.email,
      otp: user.otp,
      otpExpiresAt: user.otpExpiresAt,
      expiryMinutes,
      appName: "Recurly",
      supportEmail: GMAIL_USER,
    });

    /**
     * IMPORTANT:
     *
     * The "from" address should normally be the same Gmail
     * account authenticated through OAuth2.
     *
     * Don't use:
     *
     * noreply@recurly.com
     *
     * unless you have configured that address/domain as a
     * legitimate Gmail alias / verified sender.
     */
    const mailOptions: SendMailOptions = {
      from: `"Recurly" <${GMAIL_USER}>`,
      to: user.email,
      subject: "Account Verification",
      html,
    };

    await sendMail(mailOptions);

    logger.info(
      {
        recipient: user.email,
      },
      "OTP email sent successfully",
    );
  } catch (error) {
    logger.error(
      {
        recipient: user.email,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to send OTP email",
    );

    /**
     * Don't silently schedule an uncontrolled retry.
     *
     * If you want retries, handle them explicitly with a
     * retry function.
     */
    throw error;
  }
};

// import { Resend } from "resend";
// import nodemailer, { Transporter } from "nodemailer";
// import ejs from "ejs";
// import path from "path";

// import { env } from "../config/env";
// import logger from "../config/logger";
// import { AppError } from "../middleware/errorHandler";
// import { HTTP_STATUS, ERROR_CODES } from "../config/constants";

// /**
//  * ============================================================
//  * EMAIL CONFIGURATION
//  * ============================================================
//  */

// type GmailAuthMethod = "OAuth2" | "App Password";

// let gmailTransporter: Transporter | null = null;
// let gmailAuthMethod: GmailAuthMethod | null = null;

// /**
//  * Resend client
//  *
//  * Only initialize the client when an API key exists.
//  * This avoids creating a client with an empty API key.
//  */
// const resend = env.RESEND_API_KEY
//   ? new Resend(env.RESEND_API_KEY)
//   : null;

// /**
//  * Email template directory
//  */
// const TEMPLATE_PATH = path.join(__dirname, "../../templates/emails");

// /**
//  * ============================================================
//  * TYPES
//  * ============================================================
//  */

// interface SendOtpEmailParams {
//   to: string;
//   otp: string;
//   otpExpiresAt: Date;
// }

// interface EmailError {
//   message?: string;
//   code?: string;
//   command?: string;
//   response?: string;
// }

// /**
//  * Safely extract useful information from an unknown error.
//  */
// const getErrorDetails = (error: unknown): EmailError => {
//   if (error instanceof Error) {
//     const smtpError = error as Error & {
//       code?: string;
//       command?: string;
//       response?: string;
//     };

//     return {
//       message: smtpError.message,
//       code: smtpError.code,
//       command: smtpError.command,
//       response: smtpError.response,
//     };
//   }

//   return {
//     message: String(error),
//   };
// };

// /**
//  * ============================================================
//  * GMAIL TRANSPORTER
//  * ============================================================
//  *
//  * Priority:
//  *
//  * 1. OAuth2
//  * 2. App Password
//  *
//  * IMPORTANT:
//  * We DO NOT manually call Google's getAccessToken().
//  * Nodemailer handles OAuth2 token generation/refresh using
//  * the refresh token.
//  */

// const initializeGmailTransporter = (): void => {
//   if (!env.GMAIL_USER) {
//     logger.warn("GMAIL_USER is not configured");
//     return;
//   }

//   /**
//    * ----------------------------------------------------------
//    * Gmail OAuth2
//    * ----------------------------------------------------------
//    */
//   const hasOAuth2 =
//     !!env.GOOGLE_OAUTH_CLIENT_ID &&
//     !!env.GOOGLE_OAUTH_CLIENT_SECRET &&
//     !!env.GOOGLE_OAUTH_REFRESH_TOKEN;

//   if (hasOAuth2) {
//     try {
//       gmailTransporter = nodemailer.createTransport({
//         host: "smtp.gmail.com",
//         port: 587,
// secure: false,
// requireTLS: true,

//         auth: {
//           type: "OAuth2",
//           user: env.GMAIL_USER,
//           clientId: env.GOOGLE_OAUTH_CLIENT_ID,
//           clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
//           refreshToken: env.GOOGLE_OAUTH_REFRESH_TOKEN,
//         },

//         /**
//          * Connection settings
//          */
//         connectionTimeout: 15_000,
//         greetingTimeout: 15_000,
//         socketTimeout: 30_000,

//         /**
//          * Keep the connection alive between messages.
//          * This is useful if multiple OTP emails are sent.
//          */
//         pool: true,
//         maxConnections: 3,
//         maxMessages: 50,
//       });

//       gmailAuthMethod = "OAuth2";

//       logger.info(
//         {
//           provider: "Gmail",
//           authMethod: "OAuth2",
//           user: env.GMAIL_USER,
//         },
//         "Gmail OAuth2 transporter initialized",
//       );

//       return;
//     } catch (error) {
//       const details = getErrorDetails(error);

//       logger.error(
//         {
//           provider: "Gmail",
//           authMethod: "OAuth2",
//           ...details,
//         },
//         "Failed to initialize Gmail OAuth2 transporter",
//       );

//       gmailTransporter = null;
//       gmailAuthMethod = null;
//     }
//   }

//   /**
//    * ----------------------------------------------------------
//    * Gmail App Password fallback
//    * ----------------------------------------------------------
//    */
//   if (env.GMAIL_APP_PASSWORD) {
//     try {
//       gmailTransporter = nodemailer.createTransport({
//         host: "smtp.gmail.com",
//         port: 465,
//         secure: true,

//         auth: {
//           user: env.GMAIL_USER,
//           pass: env.GMAIL_APP_PASSWORD,
//         },

//         connectionTimeout: 15_000,
//         greetingTimeout: 15_000,
//         socketTimeout: 30_000,

//         pool: true,
//         maxConnections: 3,
//         maxMessages: 50,
//       });

//       gmailAuthMethod = "App Password";

//       logger.info(
//         {
//           provider: "Gmail",
//           authMethod: "App Password",
//           user: env.GMAIL_USER,
//         },
//         "Gmail App Password transporter initialized",
//       );

//       return;
//     } catch (error) {
//       const details = getErrorDetails(error);

//       logger.error(
//         {
//           provider: "Gmail",
//           authMethod: "App Password",
//           ...details,
//         },
//         "Failed to initialize Gmail App Password transporter",
//       );
//     }
//   }

//   logger.warn(
//     {
//       user: env.GMAIL_USER,
//       hasOAuth2,
//       hasAppPassword: !!env.GMAIL_APP_PASSWORD,
//     },
//     "Gmail is configured but no valid authentication method was found",
//   );
// };

// /**
//  * Initialize Gmail once when this module loads.
//  */
// initializeGmailTransporter();

// /**
//  * ============================================================
//  * GMAIL CONNECTION TEST
//  * ============================================================
//  *
//  * Useful during development/startup.
//  *
//  * This verifies:
//  *
//  * - DNS
//  * - TCP connection
//  * - TLS
//  * - Gmail SMTP authentication
//  * - OAuth2/App Password validity
//  *
//  * It does NOT send an email.
//  */

// export const verifyGmailConnection = async (): Promise<boolean> => {
//   if (!gmailTransporter) {
//     logger.warn("Gmail transporter is not configured");
//     return false;
//   }

//   try {
//     await gmailTransporter.verify();

//     logger.info(
//       {
//         provider: "Gmail",
//         authMethod: gmailAuthMethod,
//         user: env.GMAIL_USER,
//       },
//       "Gmail SMTP connection verified successfully",
//     );

//     return true;
//   } catch (error) {
//     const details = getErrorDetails(error);

//     logger.error(
//       {
//         provider: "Gmail",
//         authMethod: gmailAuthMethod,
//         user: env.GMAIL_USER,
//         ...details,
//       },
//       "Gmail SMTP connection verification failed",
//     );

//     return false;
//   }
// };

// /**
//  * ============================================================
//  * EJS TEMPLATE
//  * ============================================================
//  */

// const renderOtpTemplate = async (
//   otp: string,
//   otpExpiresAt: Date,
// ): Promise<string> => {
//   try {
//     const templatePath = path.join(
//       TEMPLATE_PATH,
//       "otp-email.ejs",
//     );

//     /**
//      * Calculate the remaining expiration time.
//      *
//      * We don't blindly assume 10 minutes because the actual
//      * OTP expiration time comes from the backend.
//      */
//     const remainingMilliseconds =
//       otpExpiresAt.getTime() - Date.now();

//     const expiryMinutes = Math.max(
//       1,
//       Math.ceil(remainingMilliseconds / 60_000),
//     );

//     const html = await ejs.renderFile(templatePath, {
//       otp,
//       expiryMinutes,
//       otpExpiresAt,
//       appName: "SubTrack",
//       supportEmail: "support@subtrack.com",
//     });

//     return html;
//   } catch (error) {
//     const details = getErrorDetails(error);

//     logger.error(
//       {
//         ...details,
//       },
//       "Failed to render OTP email template",
//     );

//     throw new AppError(
//       HTTP_STATUS.INTERNAL_SERVER_ERROR,
//       ERROR_CODES.INTERNAL_ERROR,
//       "Failed to render email template",
//     );
//   }
// };

// /**
//  * ============================================================
//  * RESEND
//  * ============================================================
//  */

// const sendViaResend = async (
//   to: string,
//   subject: string,
//   html: string,
// ): Promise<boolean> => {
//   if (!resend || !env.RESEND_API_KEY) {
//     logger.debug(
//       { provider: "Resend" },
//       "Resend is not configured",
//     );

//     return false;
//   }

//   try {
//     const from =
//       env.EMAIL_FROM || "onboarding@resend.dev";

//     logger.info(
//       {
//         provider: "Resend",
//         to,
//       },
//       "Attempting to send email via Resend",
//     );

//     const result = await resend.emails.send({
//       from,
//       to,
//       subject,
//       html,
//     });

//     if (result.error) {
//       logger.error(
//         {
//           provider: "Resend",
//           to,
//           error: result.error,
//         },
//         "Resend email delivery failed",
//       );

//       return false;
//     }

//     logger.info(
//       {
//         provider: "Resend",
//         to,
//         emailId: result.data?.id,
//       },
//       "Email sent successfully via Resend",
//     );

//     return true;
//   } catch (error) {
//     const details = getErrorDetails(error);

//     logger.error(
//       {
//         provider: "Resend",
//         to,
//         ...details,
//       },
//       "Unexpected Resend email error",
//     );

//     return false;
//   }
// };

// /**
//  * ============================================================
//  * GMAIL
//  * ============================================================
//  */

// const sendViaGmail = async (
//   to: string,
//   subject: string,
//   html: string,
// ): Promise<boolean> => {
//   if (!gmailTransporter || !env.GMAIL_USER) {
//     logger.debug(
//       {
//         provider: "Gmail",
//         hasTransporter: !!gmailTransporter,
//         hasUser: !!env.GMAIL_USER,
//       },
//       "Gmail is not configured",
//     );

//     return false;
//   }

//   try {
//     const from = env.EMAIL_FROM || env.GMAIL_USER;

//     logger.info(
//       {
//         provider: "Gmail",
//         authMethod: gmailAuthMethod,
//         to,
//       },
//       "Attempting to send email via Gmail",
//     );

//     const info = await gmailTransporter.sendMail({
//       from,
//       to,
//       subject,
//       html,
//     });

//     logger.info(
//       {
//         provider: "Gmail",
//         authMethod: gmailAuthMethod,
//         to,
//         messageId: info.messageId,
//         response: info.response,
//       },
//       "Email sent successfully via Gmail",
//     );

//     return true;
//   } catch (error) {
//     const details = getErrorDetails(error);

//     logger.error(
//       {
//         provider: "Gmail",
//         authMethod: gmailAuthMethod,
//         to,
//         ...details,
//       },
//       "Gmail email delivery failed",
//     );

//     return false;
//   }
// };

// /**
//  * ============================================================
//  * SEND OTP EMAIL
//  * ============================================================
//  *
//  * Provider order:
//  *
//  * Resend
//  *   ↓
//  * Gmail
//  *   ↓
//  * Development fallback
//  *
//  * Production:
//  *   If all providers fail -> throw 503
//  *
//  * Development:
//  *   If all providers fail -> log that delivery failed
//  */

// export const sendOtpEmail = async ({
//   to,
//   otp,
//   otpExpiresAt,
// }: SendOtpEmailParams): Promise<void> => {
//   /**
//    * Tests should never send real emails.
//    */
//   if (env.NODE_ENV === "test") {
//     return;
//   }

//   const subject = "Your SubTrack Verification Code";

//   /**
//    * Render the email before attempting providers.
//    */
//   const html = await renderOtpTemplate(
//     otp,
//     otpExpiresAt,
//   );

//   const hasResend = !!env.RESEND_API_KEY;

//   const hasGmailOAuth =
//     !!env.GMAIL_USER &&
//     !!env.GOOGLE_OAUTH_CLIENT_ID &&
//     !!env.GOOGLE_OAUTH_CLIENT_SECRET &&
//     !!env.GOOGLE_OAUTH_REFRESH_TOKEN;

//   const hasGmailAppPassword =
//     !!env.GMAIL_USER &&
//     !!env.GMAIL_APP_PASSWORD;

//   const hasGmail =
//     hasGmailOAuth || hasGmailAppPassword;

//   /**
//    * ----------------------------------------------------------
//    * 1. RESEND
//    * ----------------------------------------------------------
//    */

//   if (hasResend) {
//     const resendSuccess = await sendViaResend(
//       to,
//       subject,
//       html,
//     );

//     if (resendSuccess) {
//       return;
//     }

//     logger.warn(
//       { to },
//       "Resend failed; attempting Gmail fallback",
//     );
//   }

//   /**
//    * ----------------------------------------------------------
//    * 2. GMAIL
//    * ----------------------------------------------------------
//    */

//   if (hasGmail) {
//     const gmailSuccess = await sendViaGmail(
//       to,
//       subject,
//       html,
//     );

//     if (gmailSuccess) {
//       return;
//     }
//   }

//   /**
//    * ----------------------------------------------------------
//    * 3. ALL PROVIDERS FAILED
//    * ----------------------------------------------------------
//    */

//   logger.error(
//     {
//       to,
//       resendConfigured: hasResend,
//       gmailConfigured: hasGmail,
//       gmailAuthMethod,
//     },
//     "OTP email delivery failed: all configured providers failed",
//   );

//   /**
//    * NEVER log the OTP in production.
//    *
//    * Logging OTPs in production creates a serious security
//    * problem because logs may be accessible to developers,
//    * monitoring systems, log aggregators, etc.
//    */
//   if (env.NODE_ENV === "development") {
//     logger.warn(
//       {
//         to,
//         otp,
//       },
//       "OTP email delivery failed. Development OTP fallback",
//     );

//     return;
//   }

//   /**
//    * Production must fail the request if the verification
//    * email cannot be delivered.
//    */
//   throw new AppError(
//     HTTP_STATUS.SERVICE_UNAVAILABLE,
//     ERROR_CODES.EMAIL_DELIVERY_FAILED,
//     "Unable to send verification email. Please try again later.",
//   );
// };

// // import { Resend } from "resend";
// // import nodemailer, { Transporter } from "nodemailer";
// // import { google } from "googleapis";
// // import ejs from "ejs";
// // import path from "path";
// // import { env } from "../config/env";
// // import logger from "../config/logger";
// // import { AppError } from "../middleware/errorHandler";
// // import { HTTP_STATUS, ERROR_CODES } from "../config/constants";

// // // Initialize Resend client
// // const resend = new Resend(env.RESEND_API_KEY || "");

// // // Initialize Nodemailer with Gmail OAuth2 (fallback)
// // let gmailTransporter: Transporter | null = null;
// // let gmailAuthMethod: "OAuth2" | "App Password" | null = null;

// // if (env.GMAIL_USER) {
// //   // Check if OAuth2 credentials are available (preferred)
// //   if (
// //     env.GOOGLE_OAUTH_CLIENT_ID &&
// //     env.GOOGLE_OAUTH_CLIENT_SECRET &&
// //     env.GOOGLE_OAUTH_REFRESH_TOKEN
// //   ) {
// //     try {
// //       const Oauth = new google.auth.OAuth2(
// //         env.GOOGLE_OAUTH_CLIENT_ID,
// //         env.GOOGLE_OAUTH_CLIENT_SECRET,
// //       );

// //       Oauth.setCredentials({
// //         refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
// //       });
// //       const accessToken = Oauth.getAccessToken();
// //       gmailTransporter = nodemailer.createTransport({
// //         host: "smtp.gmail.com",
// //         port: 465,
// //         secure: true,
// //         auth: {
// //           type: "OAuth2",
// //           user: env.GMAIL_USER,
// //           clientId: env.GOOGLE_OAUTH_CLIENT_ID,
// //           clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
// //           refreshToken: env.GOOGLE_OAUTH_REFRESH_TOKEN,
// //           accessToken: accessToken?.toString(),
// //         },
// //         connectionTimeout: 10000, // Increase timeout to 10 seconds
// //       });
// //       gmailAuthMethod = "OAuth2";
// //       logger.info(
// //         { method: "OAuth2", user: env.GMAIL_USER },
// //         "Gmail OAuth2 transporter initialized",
// //       );
// //     } catch (error) {
// //       logger.error(
// //         { err: error },
// //         "Failed to initialize Gmail OAuth2 transporter",
// //       );
// //     }
// //   }
// //   // Fallback to app password if OAuth not configured
// //   else if (env.GMAIL_APP_PASSWORD) {
// //     try {
// //       gmailTransporter = nodemailer.createTransport({
// //         service: "gmail",
// //         auth: {
// //           user: env.GMAIL_USER,
// //           pass: env.GMAIL_APP_PASSWORD,
// //         },
// //       });
// //       gmailAuthMethod = "App Password";
// //       logger.info(
// //         { method: "App Password", user: env.GMAIL_USER },
// //         "Gmail app password transporter initialized",
// //       );
// //     } catch (error) {
// //       logger.error(
// //         { err: error },
// //         "Failed to initialize Gmail app password transporter",
// //       );
// //     }
// //   } else {
// //     logger.warn(
// //       { user: env.GMAIL_USER },
// //       "GMAIL_USER set but no OAuth credentials or app password provided",
// //     );
// //   }
// // }

// // // Email template path
// // const TEMPLATE_PATH = path.join(__dirname, "../../templates/emails");

// // interface SendOtpEmailParams {
// //   to: string;
// //   otp: string;
// //   otpExpiresAt: Date;
// // }

// // /**
// //  * Render EJS template for OTP email
// //  */
// // const renderOtpTemplate = async (
// //   otp: string,
// //   otpExpiresAt: Date,
// // ): Promise<string> => {
// //   try {
// //     const templatePath = path.join(TEMPLATE_PATH, "otp-email.ejs");
// //     const html = await ejs.renderFile(templatePath, {
// //       otp,
// //       expiryMinutes: 10,
// //       appName: "SubTrack",
// //       supportEmail: "support@subtrack.com",
// //     });
// //     return html as string;
// //   } catch (error) {
// //     logger.error({ err: error }, "Failed to render OTP email template");
// //     throw new AppError(
// //       HTTP_STATUS.INTERNAL_SERVER_ERROR,
// //       ERROR_CODES.INTERNAL_ERROR,
// //       "Failed to render email template",
// //     );
// //   }
// // };

// // /**
// //  * Send OTP email using Resend
// //  */
// // const sendViaResend = async (
// //   to: string,
// //   subject: string,
// //   html: string,
// // ): Promise<boolean> => {
// //   try {
// //     if (!env.RESEND_API_KEY) {
// //       logger.warn("RESEND_API_KEY not configured");
// //       return false;
// //     }

// //     const from = env.EMAIL_FROM || "onboarding@resend.dev";

// //     logger.info(
// //       { to, provider: "Resend" },
// //       "Attempting to send email via Resend",
// //     );

// //     const { error } = await resend.emails.send({
// //       from,
// //       to,
// //       subject,
// //       html,
// //     });

// //     if (error) {
// //       logger.error(
// //         { err: error, to, provider: "Resend" },
// //         "Failed to send OTP email via Resend",
// //       );
// //       return false;
// //     }

// //     logger.info({ to, provider: "Resend" }, "OTP email sent successfully");
// //     return true;
// //   } catch (error: any) {
// //     logger.error(
// //       {
// //         err: error,
// //         to,
// //         provider: "Resend",
// //         errorMessage: error?.message,
// //         errorCode: error?.code,
// //       },
// //       "Failed to send OTP email via Resend",
// //     );
// //     return false;
// //   }
// // };

// // /**
// //  * Send OTP email using Gmail (Nodemailer)
// //  */
// // const sendViaGmail = async (
// //   to: string,
// //   subject: string,
// //   html: string,
// // ): Promise<boolean> => {
// //   try {
// //     if (!gmailTransporter || !env.GMAIL_USER) {
// //       logger.warn(
// //         { to, hasTransporter: !!gmailTransporter, hasUser: !!env.GMAIL_USER },
// //         "Gmail not properly configured",
// //       );
// //       return false;
// //     }

// //     const from = env.EMAIL_FROM || env.GMAIL_USER;

// //     logger.info(
// //       { to, provider: "Gmail", authMethod: gmailAuthMethod },
// //       "Attempting to send email via Gmail",
// //     );

// //     await gmailTransporter.sendMail({
// //       from,
// //       to,
// //       subject,
// //       html,
// //     });

// //     logger.info(
// //       { to, provider: "Gmail", authMethod: gmailAuthMethod },
// //       "OTP email sent successfully",
// //     );
// //     return true;
// //   } catch (error: any) {
// //     logger.error(
// //       {
// //         err: error,
// //         to,
// //         provider: "Gmail",
// //         authMethod: gmailAuthMethod,
// //         errorMessage: error?.message,
// //         errorCode: error?.code,
// //       },
// //       "Failed to send OTP email via Gmail",
// //     );
// //     return false;
// //   }
// // };

// // /**
// //  * Send OTP email using Resend with Gmail fallback
// //  */
// // export const sendOtpEmail = async ({
// //   to,
// //   otp,
// //   otpExpiresAt,
// // }: SendOtpEmailParams): Promise<void> => {
// //   if (env.NODE_ENV === "test") {
// //     return;
// //   }

// //   const html = await renderOtpTemplate(otp, otpExpiresAt);
// //   const subject = "Your SubTrack Verification Code";
// //   const hasResend = !!env.RESEND_API_KEY;
// //   const hasGmailAppPassword = !!env.GMAIL_USER && !!env.GMAIL_APP_PASSWORD;
// //   const hasGmailOAuth =
// //     !!env.GMAIL_USER &&
// //     !!env.GOOGLE_OAUTH_CLIENT_ID &&
// //     !!env.GOOGLE_OAUTH_CLIENT_SECRET &&
// //     !!env.GOOGLE_OAUTH_REFRESH_TOKEN;
// //   const hasGmail = hasGmailAppPassword || hasGmailOAuth;

// //   if (hasResend && (await sendViaResend(to, subject, html))) {
// //     return;
// //   }

// //   if (hasResend && hasGmail) {
// //     logger.warn({ to }, "Resend failed, attempting Gmail fallback");
// //   }

// //   if (hasGmail && (await sendViaGmail(to, subject, html))) {
// //     return;
// //   }

// //   // Both providers failed - log OTP for development
// //   logger.error(
// //     { to, resendConfigured: hasResend, gmailConfigured: hasGmail },
// //     "OTP email delivery failed",
// //   );
// //   logger.info({ to, otp }, "OTP (email send failed, for development):");

// //   // In development, allow registration to proceed even if email fails
// //   // In production, you might want to throw an error here
// //   if (env.NODE_ENV === "production") {
// //     throw new AppError(
// //       HTTP_STATUS.SERVICE_UNAVAILABLE,
// //       ERROR_CODES.EMAIL_DELIVERY_FAILED,
// //       "Unable to send verification email. Please try again later.",
// //     );
// //   }
// // };
