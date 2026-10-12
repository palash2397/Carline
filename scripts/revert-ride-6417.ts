import mongoose from 'mongoose';

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://patilpalash44_db_user:nQIMo6Y7tCo8YYTV@cluster0.o2ln3ff.mongodb.net/carline';

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No DB');

  const tripNumber = 'TRIP-300580-806';
  const rideId = '6accf26d8adc11bb345d58c4';
  const driverPhone = '8455025990';

  console.log('Reverting ride #6417 to exact previous state...');
  await db.collection('rides').updateOne(
    { tripNumber },
    {
      $set: {
        rideStatus: 'PAYMENT_PENDING',
        paymentStatus: 'PENDING',
        paymentType: null,
        payment: null,
        rideAmount: 0,
        originalCalculatedFare: null,
        updatedAt: new Date('2026-10-12T15:24:44.431Z'),
      },
      $unset: {
        selectedZone: '',
        ridePaymentDateTime: '',
      },
    },
  );

  console.log('Reverting driver Shulem Markowitz to exact previous state...');
  await db.collection('drivers').updateOne(
    {
      $or: [
        { mobileNumber: driverPhone },
        { mobileNumber: `+1${driverPhone}` },
        { mobileNumber: { $regex: `${driverPhone}$` } },
      ],
    },
    {
      $set: {
        activeRideId: rideId,
        ongoingRides: 'YES',
      },
    },
  );

  console.log('Revert completed successfully.');
  await mongoose.disconnect();
}

run().catch(console.error);
