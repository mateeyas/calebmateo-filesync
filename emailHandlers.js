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

async function sendErrorNotification(error, context) {
  try {
    await resend.emails.send({
      from: 'Calebmateo.com <noreply@calebmateo.com>',
      to: 'logs@mskdgrf.com',
      subject: '⚠️ Email Notification Error',
      html: `
        <h2>Email Notification Error</h2>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Context:</strong> ${context}</p>
        <p><strong>Error:</strong> ${error.message}</p>
        <pre>${JSON.stringify(error, null, 2)}</pre>
      `,
    });
    console.log('Error notification sent to logs@mskdgrf.com');
  } catch (logError) {
    console.error('Failed to send error notification:', logError);
  }
}

async function sendNewFilesNotification(recipients, fileCount) {
  try {
    const subjectEmojis = getRandomEmojis();
    const headerEmojis = getRandomEmojis();
    const signatureEmojis = getRandomEmojis();

    // Map recipients to promises but handle individual failures
    const emailResults = await Promise.allSettled(
      recipients.map(async (recipient) => {
        try {
          const response = await resend.emails.send({
            from: 'Calebmateo.com <noreply@calebmateo.com>',
            to: recipient.email,
            subject: `New files uploaded ${subjectEmojis}`,
            html: `
              <h2>New files uploaded ${headerEmojis}</h2>
              <p>Hi ${recipient.name}!</p>
              <p>Good news! ${fileCount} new file${fileCount !== 1 ? 's have' : ' has'} been uploaded to Calebmateo.com. A big thanks to whoever uploaded them!</p>
              <p>Take a look: <a href="https://www.calebmateo.com/app/albums/recent-photos"><strong>Recent photos and videos</strong></a></p>
              <p>See you soon! ${signatureEmojis}</p>
            `,
          });
          console.log(`Email sent successfully to ${recipient.email}:`, response.id);
          return { success: true, email: recipient.email, id: response.id };
        } catch (error) {
          console.error(`Failed to send email to ${recipient.email}:`, error);
          await sendErrorNotification(error, `Failed to send email to ${recipient.email}`);
          return { success: false, email: recipient.email, error: error.message };
        }
      })
    );

    // Process results
    const successful = emailResults.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;
    const failed = emailResults.filter(result => 
      result.status === 'rejected' || !result.value.success
    ).length;

    console.log(`Email notification summary: ${successful} sent successfully, ${failed} failed`);
    
    // If all emails failed, send error notification and throw error
    if (successful === 0 && failed > 0) {
      const error = new Error('All email notifications failed to send');
      await sendErrorNotification(error, `All ${failed} email notifications failed`);
      throw error;
    }

    return emailResults;
  } catch (error) {
    console.error('Error in email notification process:', error);
    await sendErrorNotification(error, 'General email notification process error');
    throw error;
  }
}

module.exports = {
  sendNewFilesNotification,
};
