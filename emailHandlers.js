const { Resend } = require('resend');

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Function to get random emojis for email content
function getRandomEmojis() {
  const emojis = ['📸', '🎥', '🖼️', '🏞️', '🌄', '🌅', '🌠', '🎞️', '📽️', '🖼️', '🎉', '🥳', '🎊', '☀️', '🌞'];
  const numEmojis = Math.floor(Math.random() * 3) + 1; // Random number between 1 and 3
  let selectedEmojis = '';
  
  for (let i = 0; i < numEmojis; i++) {
    const randomIndex = Math.floor(Math.random() * emojis.length);
    selectedEmojis += emojis[randomIndex];
  }
  
  return selectedEmojis;
}

async function sendNewFilesNotification(recipients, fileCount) {
  try {
    const emojis = getRandomEmojis();

    const emailPromises = recipients.map(async (recipient) => {
      const response = await resend.emails.send({
        from: 'Calebmateo.com <noreply@calebmateo.com>',
        to: recipient.email,
        subject: `New files uploaded ${getRandomEmojis()}`,
        html: `
          <h2>New files uploaded ${getRandomEmojis()}</h2>
          <p>Hi ${recipient.name}!</p>
          <p>Good news! ${fileCount} new file${fileCount !== 1 ? 's have' : ' has'} been uploaded to Calebmateo.com. A big thanks to whoever uploaded them!</p>
          <p>Take a look: <a href="https://www.calebmateo.com/app/albums/recent-photos"><strong>Recent photos and videos</strong></a></p>
          <p>See you soon! ${getRandomEmojis()}</p>
        `,
      });
      console.log(`Email sent successfully to ${recipient.email}:`, response.id);
      return response;
    });

    const results = await Promise.all(emailPromises);
    console.log(`Emails sent to ${results.length} recipients`);
    return results;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

module.exports = {
  sendNewFilesNotification,
};
