import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Check if we have a service account or can use application default credentials
try {
  admin.initializeApp(); // relies on GOOGLE_APPLICATION_CREDENTIALS if any, or default GCP
} catch(e) {
  console.log("Admin init failed, likely no credentials. Please provide credentials to run admin SDK.");
}

async function verify() {
  try {
    const db = admin.firestore();
    const schools = await db.collection('schools').get();
    console.log(`Schools: ${schools.docs.length}`);
    const classes = await db.collection('classes').get();
    console.log(`Classes: ${classes.docs.length}`);
    const students = await db.collection('students').get();
    console.log(`Students: ${students.docs.length}`);
  } catch(e) {
    console.error("Admin fetch error:", e.message);
  }
}
verify();
