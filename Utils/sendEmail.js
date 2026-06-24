import nodemailer from "nodemailer";

export const sendWindowNotification = async (
  toEmail,
  userName,
  wonBonds,
  unsubscribeToken,
) => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) return false;
  if (!wonBonds || wonBonds.length === 0) return false;

  const unsubscribeUrl = `${process.env.BACKEND_SERVER}/unsubscribe?token=${unsubscribeToken}`;

  // ✅ Total prize amount calculate
  const totalAmount = wonBonds.reduce((sum, b) => sum + b.amount, 0);

  // ✅ প্রতিটা bond এর জন্য HTML row
  const bondRowsHtml = wonBonds
    .map(
      ({ number, label, amount }) => `
      <tr>
        <td style="padding:12px 16px; border-bottom:1px solid #e8f0ee; font-family:'Courier New', monospace; font-size:18px; font-weight:700; color:#244B43; letter-spacing:2px;">
          ${number}
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #e8f0ee; font-size:13px; color:#555;">
          ${label}
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #e8f0ee; font-size:14px; font-weight:600; color:#1a1a1a; text-align:right;">
          ৳ ${amount.toLocaleString("bn-BD")}
        </td>
      </tr>
    `,
    )
    .join("");

  // ✅ Plain text fallback
  const bondRowsText = wonBonds
    .map(
      (b) =>
        `  ${b.number} | ${b.label} | ৳ ${b.amount.toLocaleString("bn-BD")}`,
    )
    .join("\n");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser, pass: emailPass },
  });

  try {
    await transporter.sendMail({
      from: `"প্রাইজ বন্ড চেকার" <${emailUser}>`,
      to: toEmail,
      subject:
        wonBonds.length === 1
          ? `আপনার বন্ড ${wonBonds[0].number} বিজয়ী হয়েছে!`
          : `আপনার ${wonBonds.length}টি বন্ড বিজয়ী হয়েছে!`,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      text: `অভিনন্দন ${userName}!\n\nআপনার নিচের বন্ডগুলো বিজয়ী হয়েছে:\n\n${bondRowsText}\n\nমোট পুরস্কার: ৳ ${totalAmount.toLocaleString("bn-BD")}\n\nড্যাশবোর্ড: ${process.env.FRONTEND_SERVER}/dashboard\n\nআর email পেতে না চাইলে: ${unsubscribeUrl}`,
      html: `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#f5f5f3; font-family: Arial, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3; padding:32px 0;">
  <tr><td align="center">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px; width:100%; background:#ffffff; border-radius:8px; overflow:hidden;">

    <tr><td style="height:4px; background:#244B43;"></td></tr>

    <tr>
      <td style="padding:40px 40px 32px;">
        <p style="margin:0 0 28px; font-size:13px; color:#888; letter-spacing:1px; text-transform:uppercase;">প্রাইজ বন্ড চেকার</p>

        <h1 style="margin:0 0 16px; color:#1a1a1a; font-size:22px; font-weight:600;">
          অভিনন্দন, ${userName}!
        </h1>

        <p style="margin:0 0 24px; color:#555; font-size:15px; line-height:1.8;">
          আপনার নিচের ${wonBonds.length === 1 ? "বন্ডটি" : `${wonBonds.length}টি বন্ড`} এই মাসের ড্রতে বিজয়ী হয়েছে।
        </p>

        <!-- ✅ Bond table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="background:#f0f8f5; border:1px solid #c8e8df; border-radius:8px; margin-bottom:16px; border-collapse:collapse;">
          <thead>
            <tr style="background:#244B43;">
              <th style="padding:10px 16px; font-size:12px; color:#fff; text-align:left; border-radius:8px 0 0 0;">বন্ড নম্বর</th>
              <th style="padding:10px 16px; font-size:12px; color:#fff; text-align:left;">পুরস্কার</th>
              <th style="padding:10px 16px; font-size:12px; color:#fff; text-align:right; border-radius:0 8px 0 0;">পরিমাণ</th>
            </tr>
          </thead>
          <tbody>
            ${bondRowsHtml}
          </tbody>
        </table>

        <!-- ✅ Total -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="margin-bottom:28px;">
          <tr>
            <td style="padding:12px 16px; background:#244B43; border-radius:6px;">
              <span style="font-size:13px; color:#a8d5c8;">মোট পুরস্কার</span>
              <span style="float:right; font-size:16px; font-weight:700; color:#ffffff;">
                ৳ ${totalAmount.toLocaleString("bn-BD")}
              </span>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td style="background:#244B43; border-radius:6px;">
              <a href="${process.env.FRONTEND_SERVER}/dashboard"
                style="display:inline-block; color:#ffffff; text-decoration:none; padding:12px 28px; font-size:14px; font-weight:500;">
                ড্যাশবোর্ড খুলুন &rarr;
              </a>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="border-top:1px solid #f0f0f0; padding-top:24px;">
            <p style="margin:0; color:#999; font-size:13px; line-height:1.7;">
              কোনো সমস্যা হলে — <a href="mailto:${emailUser}" style="color:#244B43; text-decoration:none;">${emailUser}</a>
            </p>
          </td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#fafafa; border-top:1px solid #f0f0f0; padding:16px 40px;">
        <p style="margin:0; font-size:12px; color:#bbb;">
          আপনি প্রাইজ বন্ড চেকারে সাইন আপ করেছেন বলে এই ইমেইল পাঠানো হয়েছে। &nbsp;
          <a href="${unsubscribeUrl}" style="color:#bbb; text-decoration:none;">Unsubscribe</a>
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`,
    });
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${toEmail}:`, error.message);
    return false;
  }
};
