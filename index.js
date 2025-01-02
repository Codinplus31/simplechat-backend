const express = require('express');
const nodemailer = require('nodemailer');
 const cors = require('cors');


const app = express();
app.use(cors());
app.use(express.json());
var EMAIL_USER= "gazaneedhelp108@gmail.com"
var EMAIL_PASS= "rcyf wpbg bufk niae"
var ADMIN_EMAIL= "harperlily2025@gmail.com"
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

app.post('/api/submit-donation', async (req, res) => {
  const { name, email, number, country, amount } = req.body;

  const userMailOptions = {
    from:{
    name: 'GAZANEEDHELP',
    address: EMAIL_USER
},
    to: email,
    subject: 'Thank you for your donation',
    text: `Dear ${name},\n\nThank you for your generous donation of $${amount}. Your support means a lot to us and will help children and families in Gaza with food and water.\n\nBest regards,\n Charity Team`,
  };

  const adminMailOptions = {
    from: EMAIL_USER,
    to: ADMIN_EMAIL,
    subject: 'New Donation Received',
    text: `A new donation has been received:\n\nName: ${name}\nEmail: ${email}\nPhone: ${number || 'Not provided'}\nCountry: ${country}\nAmount: $${amount}`,
  };

  try {
    await transporter.sendMail(userMailOptions);
    await transporter.sendMail(adminMailOptions);
    res.status(200).json({ message: 'Donation submitted successfully' });
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({ message: 'Error submitting donation' });
  }
});




app.post('/send-email', async (req, res) => {
  const { name, email, message } = req.body;
const transporters = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});
  const mailOptions = {
     from:{
    name: 'GAZANEEDHELP Contact',
    address: email
}, // sender address
    to: "harperlily2025@gmail.com", // list of receivers
    subject: "New Contact Form Submission", // Subject line
    text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`, // plain text body
    html: `<p><strong>Name:</strong> ${name}</p>
           <p><strong>Email:</strong> ${email}</p>
           <p><strong>Message:</strong> ${message}</p>` // html body
  };

  try {
    await transporters.sendMail(mailOptions);
    res.status(200).send('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).send('Error sending email');
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
/*
To use this backend, you'll need to create a .env file with the following variables:

EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password
ADMIN_EMAIL=admin@example.com
PORT=3000

Make sure to replace the email and password with your actual Gmail credentials, and set the ADMIN_EMAIL to the email address where you want to receive notifications about new donations.

To integrate this backend with your React frontend, you'll need to update the UserInfoPopup component to send a POST request to the /api/submit-donation endpoint when the form is submitted. Here's how you can modify the handleSubmit function in the UserInfoPopup component:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    const response = await fetch('http://localhost:3000/api/submit-donation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...userInfo,
        amount: price, // Make sure to pass the donation amount from props
      }),
    });
    if (response.ok) {
      onClose();
      // Show a success message to the user
      alert('Thank you for your donation!');
    } else {
      throw new Error('Failed to submit donation');
    }
  } catch (error) {
    console.error('Error submitting donation:', error);
    // Show an error message to the user
    alert('There was an error submitting your donation. Please try again.');
  }
};
*/
	    
