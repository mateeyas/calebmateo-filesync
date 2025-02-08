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

async function sendErrorNotification(logger, error, context) {
  try {
    await resend.emails.send({
      from: '"Calebmateo.com" <noreply@calebmateo.com>',
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

async function sendNewFilesNotification(logger, recipients, fileCount, uploadSummary, uploaderStats) {
  try {
    // Validate inputs
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('No recipients provided for email notification');
    }
    if (!fileCount || fileCount <= 0) {
      throw new Error('Invalid file count for email notification');
    }
    if (!uploadSummary) {
      throw new Error('Upload summary is required');
    }
    if (!Array.isArray(uploaderStats)) {
      throw new Error('Uploader stats must be an array');
    }

    await logger.info('Starting email notifications', { 
      recipientCount: recipients.length, 
      fileCount,
      uploadSummary 
    });

    const subjectEmojis = getRandomEmojis();
    const headerEmojis = getRandomEmojis();
    const signatureEmojis = getRandomEmojis();

    // Initialize errors array
    const errors = [];

    // Map recipients to promises but handle individual failures
    const emailResults = await Promise.allSettled(
      recipients.map(async (recipient) => {
        if (!recipient.email || !recipient.name) {
          await logger.warn('Invalid recipient data', { recipient });
          return { success: false, email: recipient.email || 'unknown', error: 'Invalid recipient data' };
        }

        try {
          const response = await resend.emails.send({
            from: '"Calebmateo.com" <noreply@calebmateo.com>',
            to: recipient.email,
            subject: `New files uploaded ${subjectEmojis}`,
            html: `
              <h2>New files uploaded ${headerEmojis}</h2>
              <p>Hi ${recipient.name}!</p>
              <p>Great news! ${uploadSummary} ${uploadSummary.includes(' and ') ? 'have' : 'has'} uploaded new files to Calebmateo.com.</p>
              <p>Take a look: <a href="https://www.calebmateo.com/app/albums/recent-photos"><strong>Recent photos and videos</strong></a></p>
              
              <h3>Upload Statistics</h3>
              <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                <tr style="background-color: #f8f9fa;">
                  <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Uploader</th>
                  <th style="padding: 8px; text-align: right; border: 1px solid #dee2e6;">Last 7 days</th>
                  <th style="padding: 8px; text-align: right; border: 1px solid #dee2e6;">Last 30 days</th>
                  <th style="padding: 8px; text-align: right; border: 1px solid #dee2e6;">Last 365 days</th>
                </tr>
                ${uploaderStats.length > 0 ? uploaderStats.map(stat => `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">${stat.uploader_name || 'Someone'}</td>
                    <td style="padding: 8px; text-align: right; border: 1px solid #dee2e6;">${stat.last_7_days || '0'}</td>
                    <td style="padding: 8px; text-align: right; border: 1px solid #dee2e6;">${stat.last_30_days || '0'}</td>
                    <td style="padding: 8px; text-align: right; border: 1px solid #dee2e6;">${stat.last_365_days || '0'}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">No upload history available</td>
                  </tr>
                `}
              </table>
              
              <p>See you soon! ${signatureEmojis}</p>
            `,
          });
          
          // Resend API success is indicated by the presence of an 'id'
          await logger.info('Resend API Response', { 
            recipient: recipient.email,
            response
          });
          
          // The response itself is the id string in newer versions of the API
          const messageId = typeof response === 'string' ? response : response?.id;
          
          if (!messageId) {
            throw new Error(`Invalid response from email service: ${JSON.stringify(response)}`);
          }
          
          await logger.info('Email sent successfully', { 
            recipient: recipient.email,
            messageId 
          });
          return { success: true, email: recipient.email, id: messageId };
        } catch (error) {
          await logger.error('Failed to send email', {
            recipient: recipient.email,
            error: error.message
          });
          // Collect error instead of sending notification immediately
          errors.push({ recipient: recipient.email, error: error.message });
          return { success: false, email: recipient.email, error: error.message };
        }
      })
    );

    // Process results
    const successful = emailResults.filter(result => 
      result.status === 'fulfilled' && result.value?.success
    ).length;
    const failed = emailResults.filter(result => 
      result.status === 'rejected' || !result.value?.success
    ).length;

    await logger.info('Email notification summary', { successful, failed });
    
    // Send error notification if ANY emails failed
    if (failed > 0) {
      const errorMessage = failed === recipients.length 
        ? `All ${failed} email notifications failed`
        : `${failed} out of ${recipients.length} email notifications failed`;
        
      const consolidatedError = new Error(errorMessage);
      await sendErrorNotification(
        logger, 
        consolidatedError, 
        `Failed recipients:\n${errors.map(e => `${e.recipient}: ${e.error}`).join('\n')}`
      );
      
      // Only throw if all failed - this maintains existing behavior for complete failures
      if (failed === recipients.length) {
        throw consolidatedError;
      }
    }

    return emailResults;
  } catch (error) {
    await logger.error('Error in email notification process', { 
      error: error.message,
      stack: error.stack
    });
    // Only send error notification if it wasn't already sent above
    if (!error.message.includes('email notifications failed')) {
      await sendErrorNotification(logger, error, 'General email notification process error');
    }
    throw error;
  }
}

module.exports = {
  sendNewFilesNotification,
};
