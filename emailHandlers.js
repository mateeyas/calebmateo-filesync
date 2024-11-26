const { Resend } = require('resend');
const { logger } = require('./logHandlers');

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
    await logger.info('Error notification email sent', { recipient: 'logs@mskdgrf.com' });
  } catch (logError) {
    await logger.error('Failed to send error notification email', { 
      error: logError.message,
      originalError: error.message,
      context 
    });
  }
}

async function sendNewFilesNotification(recipients, fileCount) {
  try {
    // Validate inputs
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('No recipients provided for email notification');
    }
    if (!fileCount || fileCount <= 0) {
      throw new Error('Invalid file count for email notification');
    }

    await logger.info('Starting email notifications', { recipientCount: recipients.length, fileCount });

    const subjectEmojis = getRandomEmojis();
    const headerEmojis = getRandomEmojis();
    const signatureEmojis = getRandomEmojis();

    // Map recipients to promises but handle individual failures
    const emailResults = await Promise.allSettled(
      recipients.map(async (recipient) => {
        if (!recipient.email || !recipient.name) {
          await logger.warn('Invalid recipient data', { recipient });
          return { success: false, email: recipient.email || 'unknown', error: 'Invalid recipient data' };
        }

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
          
          if (!response || !response.id) {
            throw new Error('Invalid response from email service');
          }
          
          await logger.info('Email sent successfully', { 
            recipient: recipient.email,
            messageId: response.id 
          });
          return { success: true, email: recipient.email, id: response.id };
        } catch (error) {
          await logger.error('Failed to send email', {
            recipient: recipient.email,
            error: error.message
          });
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

    await logger.info('Email notification summary', { successful, failed });
    
    if (successful === 0 && failed > 0) {
      const error = new Error('All email notifications failed to send');
      await logger.error('All email notifications failed', { failedCount: failed });
      await sendErrorNotification(error, `All ${failed} email notifications failed`);
      throw error;
    }

    return emailResults;
  } catch (error) {
    await logger.error('Error in email notification process', { 
      error: error.message,
      stack: error.stack
    });
    await sendErrorNotification(error, 'General email notification process error');
    throw error;
  }
}

module.exports = {
  sendNewFilesNotification,
};
