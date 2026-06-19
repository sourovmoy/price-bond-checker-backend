import nodemailer from "nodemailer";

export const sendWindowNotification = async (toEmail, userName, bondNumber) => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    console.error("❌ Error: Email credentials are missing in process.env!");
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
  try {
    await transporter.sendMail({
      from: `"প্রাইজ বন্ড চেকার" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: "অভিনন্দন! আপনার প্রাইজ বন্ড বিজয়ী হয়েছে!",
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: auto;">
          <h2 style="color: #244B43;">অভিনন্দন, ${userName}!</h2>
          <p>আপনার নিম্নলিখিত প্রাইজ বন্ডটি বিজয়ী হয়েছে:</p>
          <p style="font-size: 18px; font-weight: bold; color: #244B43;">
            ${bondNumber}
          </p>
          <p>বিস্তারিত জানতে আপনার ড্যাশবোর্ডে লগইন করুন।</p>
        </div>
      `,
    });
    console.log(`✅ Email sent to ${toEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${toEmail}:`, error.message);
  }
};
