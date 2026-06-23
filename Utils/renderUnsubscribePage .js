export const renderUnsubscribePage = (title, message) => `
  <!DOCTYPE html>
  <html lang="bn">
  <head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f3; }
      .box { background: white; padding: 40px; border-radius: 10px; text-align: center; max-width: 400px; }
      h2 { color: #244B43; margin: 0 0 12px; }
      p { color: #666; margin: 0 0 20px; }
      a { color: #244B43; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2>${title}</h2>
      <p>${message}</p>
      <a href="${process.env.FRONTEND_SERVER}">হোমপেজে ফিরে যান</a>
    </div>
  </body>
  </html>
`;
