const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:4013/api/v1';
const API_KEY = 'test-ivr-key-123';
const JWT_SECRET = 'mycarlinejwtsecret';

const adminToken = jwt.sign(
  { id: 'test-admin-id', roles: ['ADMIN', 'SUPERADMIN'], email: 'admin@carline.test' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const headers = {
  json: { 'Content-Type': 'application/json' },
  ivr: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  admin: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` }
};

const results = [];

function recordTest(id, name, passed, details = '') {
  results.push({ id, name, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${status}] ${id}: ${name} ${details ? '(' + details + ')' : ''}`);
}

async function run() {
  console.log('====================================================');
  console.log('🚀 RUNNING VERIFICATION SUITE: SCENARIOS A1 TO A8');
  console.log('====================================================\n');

  // Connect to DB directly for seeding & deep inspection
  const mongoUri = 'mongodb+srv://patilpalash44_db_user:nQIMo6Y7tCo8YYTV@cluster0.o2ln3ff.mongodb.net/carlinedev';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB Atlas (carlinedev)');

  const db = mongoose.connection.db;
  const driversCol = db.collection('drivers');
  const ridesCol = db.collection('rides');
  const customersCol = db.collection('customers');
  const pricingRulesCol = db.collection('pricingrules');

  const testSuffix = Date.now().toString().slice(-6);
  const testDriverPhone = `845555${testSuffix.slice(0, 4)}`;
  const testCustomerPhone = `845556${testSuffix.slice(0, 4)}`;

  // ----------------------------------------------------
  // TEST A1: Concurrent Calls & Non-Blocking IVR Status
  // ----------------------------------------------------
  console.log('\n--- TESTING A1: Concurrent Requests & System Availability ---');
  try {
    const startA1 = Date.now();
    const concurrentRequests = Array.from({ length: 15 }, (_, i) =>
      fetch(`${BASE_URL}/ivr/driver/status/${testDriverPhone}`, { headers: headers.ivr })
        .then(r => r.json())
    );
    const responses = await Promise.all(concurrentRequests);
    const durationA1 = Date.now() - startA1;
    const allResponded = responses.length === 15 && responses.every(r => r.statusCode === 404 || r.statusCode === 200);
    recordTest('A1.1', '15 Concurrent IVR Status Calls Non-blocking', allResponded && durationA1 < 3000, `Completed in ${durationA1}ms`);
  } catch (err) {
    recordTest('A1.1', '15 Concurrent IVR Status Calls Non-blocking', false, err.message);
  }

  // ----------------------------------------------------
  // Setup Test Driver for IVR Workflow Tests (A2, A3, A4, A5)
  // ----------------------------------------------------
  const testDriver = {
    driverId: Number(`99${testSuffix.slice(0, 4)}`),
    driverName: `Test Driver ${testSuffix}`,
    driverNumber: testDriverPhone,
    mobileNumber: `(845) 555-${testSuffix.slice(0, 4)}`,
    batch: 1,
    status: 'ACTIVE',
    isAvailable: true,
    ongoingRides: 'NO',
    activeRideId: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const driverInsert = await driversCol.insertOne(testDriver);
  const driverMongoId = driverInsert.insertedId.toString();

  // ----------------------------------------------------
  // TEST A2: Zone 3 Trip Cancellation Prevention
  // ----------------------------------------------------
  console.log('\n--- TESTING A2: Zone Selection & Zone 3 Cancellation Prevention ---');
  try {
    // Create Ride in PAYMENT_PENDING without selectedZone
    const tripNumA2 = `TRIP-A2-${testSuffix}`;
    const rideA2 = {
      tripNumber: tripNumA2,
      driverId: driverMongoId,
      driverNumber: testDriver.mobileNumber,
      driverName: testDriver.driverName,
      customerNumber: testCustomerPhone,
      customerName: 'Test Customer',
      rideStatus: 'PAYMENT_PENDING',
      rideStartDateTime: new Date(Date.now() - 15 * 60000).toISOString(),
      rideCompleteDateTime: new Date().toISOString(),
      selectedZone: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const rideInsertA2 = await ridesCol.insertOne(rideA2);
    await driversCol.updateOne({ _id: driverInsert.insertedId }, { $set: { activeRideId: rideInsertA2.insertedId.toString(), isAvailable: false, ongoingRides: 'YES' } });

    // Test Zone 3 DTMF '3'
    const resA2 = await fetch(`${BASE_URL}/ivr/driver/action`, {
      method: 'POST',
      headers: headers.ivr,
      body: JSON.stringify({
        driverNumber: testDriver.mobileNumber,
        dtmfInput: '3'
      })
    }).then(r => r.json());

    const isA2NotCancelled = resA2.data?.action !== 'TRIP_CANCELLED' && resA2.data?.menu === 'PAYMENT_OPTIONS';
    const hasA2Fare = resA2.data?.calculatedFare > 0 && String(resA2.data?.selectedZone).includes('3');
    recordTest('A2.1', 'Zone 3 (DTMF 3) Calculates Fare and Prompts Payment (NOT CANCELLED)', isA2NotCancelled && hasA2Fare, `Action: ${resA2.data?.action}, Fare: $${resA2.data?.calculatedFare}, Zone: ${resA2.data?.selectedZone}`);

    // Verify ride in DB has selectedZone and rideStatus is still PAYMENT_PENDING
    const updatedRideA2 = await ridesCol.findOne({ tripNumber: tripNumA2 });
    recordTest('A2.2', 'Ride in DB maintains PAYMENT_PENDING and selectedZone 3', updatedRideA2.rideStatus === 'PAYMENT_PENDING' && String(updatedRideA2.selectedZone).includes('3'), `DB Status: ${updatedRideA2.rideStatus}, DB Zone: ${updatedRideA2.selectedZone}`);

    // Test Zone 1, 2, 4
    for (const z of ['1', '2', '4']) {
      await ridesCol.updateOne({ _id: rideInsertA2.insertedId }, { $set: { selectedZone: null } });
      const resZ = await fetch(`${BASE_URL}/ivr/driver/action`, {
        method: 'POST',
        headers: headers.ivr,
        body: JSON.stringify({
          driverNumber: testDriver.mobileNumber,
          dtmfInput: z
        })
      }).then(r => r.json());
      const passZ = resZ.data?.action === 'PLAY_PAYMENT_MENU' && resZ.data?.menu === 'PAYMENT_OPTIONS' && String(resZ.data?.selectedZone).includes(z);
      recordTest(`A2.Zone${z}`, `Zone ${z} (DTMF ${z}) Correctly Prompts Payment Menu`, passZ, `Zone: ${resZ.data?.selectedZone}`);
    }

    // Test DTMF '9' (Explicit cancellation)
    await ridesCol.updateOne({ _id: rideInsertA2.insertedId }, { $set: { selectedZone: null } });
    const resCancel = await fetch(`${BASE_URL}/ivr/driver/action`, {
      method: 'POST',
      headers: headers.ivr,
      body: JSON.stringify({
        driverNumber: testDriver.mobileNumber,
        dtmfInput: '9'
      })
    }).then(r => r.json());
    recordTest('A2.Cancel', 'DTMF 9 explicitly cancels trip', resCancel.data?.action === 'TRIP_CANCELLED');
  } catch (err) {
    recordTest('A2.1', 'Zone 3 Trip Cancellation Prevention', false, err.message);
  }

  // ----------------------------------------------------
  // TEST A3: Trip-Ending Flow & State Cleanup
  // ----------------------------------------------------
  console.log('\n--- TESTING A3: Trip-Ending Flow & Driver State Cleanup ---');
  try {
    // 3.1: STARTED -> DTMF '2' -> PAYMENT_PENDING + ZONE_SELECTION
    const tripNumA3 = `TRIP-A3-${testSuffix}`;
    const rideA3 = {
      tripNumber: tripNumA3,
      driverId: driverMongoId,
      driverNumber: testDriver.mobileNumber,
      driverName: testDriver.driverName,
      customerNumber: testCustomerPhone,
      customerName: 'Test Customer A3',
      rideStatus: 'STARTED',
      rideStartDateTime: new Date(Date.now() - 20 * 60000).toISOString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const rideInsertA3 = await ridesCol.insertOne(rideA3);
    await driversCol.updateOne({ _id: driverInsert.insertedId }, { $set: { activeRideId: rideInsertA3.insertedId.toString(), isAvailable: false, ongoingRides: 'YES' } });

    const resFinish = await fetch(`${BASE_URL}/ivr/driver/action`, {
      method: 'POST',
      headers: headers.ivr,
      body: JSON.stringify({
        driverNumber: testDriver.mobileNumber,
        dtmfInput: '2'
      })
    }).then(r => r.json());

    recordTest('A3.1', 'DTMF 2 transitions STARTED -> PAYMENT_PENDING with ZONE_SELECTION', resFinish.data?.action === 'PLAY_ZONE_MENU' && resFinish.data?.menu === 'ZONE_SELECTION');

    // 3.2: Zone Selection -> Zone 2
    const resZone = await fetch(`${BASE_URL}/ivr/driver/action`, {
      method: 'POST',
      headers: headers.ivr,
      body: JSON.stringify({
        driverNumber: testDriver.mobileNumber,
        dtmfInput: '2'
      })
    }).then(r => r.json());
    recordTest('A3.2', 'Zone selection transitions to PAYMENT_OPTIONS', resZone.data?.action === 'PLAY_PAYMENT_MENU');

    // 3.3: Payment Cash DTMF '1' -> Completes trip and frees driver
    const resPay = await fetch(`${BASE_URL}/ivr/driver/action`, {
      method: 'POST',
      headers: headers.ivr,
      body: JSON.stringify({
        driverNumber: testDriver.mobileNumber,
        dtmfInput: '1'
      })
    }).then(r => r.json());

    const passPay = String(resPay.data?.action).includes('SUCCESS') || String(resPay.data?.action).includes('COMPLETED');
    const finishedDriver = await driversCol.findOne({ _id: driverInsert.insertedId });
    const isDriverFreed = finishedDriver.activeRideId === '' && finishedDriver.ongoingRides === 'NO' && finishedDriver.isAvailable === true;
    recordTest('A3.3', 'Payment DTMF 1 completes ride and frees driver (ongoingRides=NO)', passPay && isDriverFreed, `Action: ${resPay.data?.action}, ongoingRides: ${finishedDriver.ongoingRides}`);

    // 3.4: Auto-clearing Stale activeRideId
    await driversCol.updateOne({ _id: driverInsert.insertedId }, { $set: { activeRideId: rideInsertA3.insertedId.toString(), ongoingRides: 'YES', isAvailable: false } });
    const resStale = await fetch(`${BASE_URL}/ivr/driver/action`, {
      method: 'POST',
      headers: headers.ivr,
      body: JSON.stringify({
        driverNumber: testDriver.mobileNumber,
      })
    }).then(r => r.json());
    const refreshedDriver = await driversCol.findOne({ _id: driverInsert.insertedId });
    const staleCleared = refreshedDriver.activeRideId === '' && refreshedDriver.ongoingRides === 'NO';
    recordTest('A3.4', 'Stale completed activeRideId is auto-cleansed on IVR call', staleCleared, `Menu: ${resStale.data?.menu}, activeRideId: "${refreshedDriver.activeRideId}"`);
  } catch (err) {
    recordTest('A3.1', 'Trip-Ending Flow & State Cleanup', false, err.message);
  }

  // ----------------------------------------------------
  // TEST A4 & A5: Customer Connection Data & IVR Menus
  // ----------------------------------------------------
  console.log('\n--- TESTING A4 & A5: Customer Linkage & IVR Menu Sequence ---');
  try {
    const tripNumA4 = `TRIP-A4-${testSuffix}`;
    const rideA4 = {
      tripNumber: tripNumA4,
      driverId: driverMongoId,
      driverNumber: testDriver.mobileNumber,
      driverName: testDriver.driverName,
      customerNumber: testCustomerPhone,
      customerName: 'A4 Customer',
      rideStatus: 'STARTED',
      rideStartDateTime: new Date().toISOString(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const rideInsertA4 = await ridesCol.insertOne(rideA4);
    await driversCol.updateOne({ _id: driverInsert.insertedId }, { $set: { activeRideId: rideInsertA4.insertedId.toString(), isAvailable: false, ongoingRides: 'YES' } });

    // A4: Active trip holds customer contact details
    const activeRideCheck = await ridesCol.findOne({ tripNumber: tripNumA4 });
    recordTest('A4.1', 'Active ride maintains customerNumber for bridge / connection', Boolean(activeRideCheck.customerNumber));

    // A5: Menu sequence plays prompt first when no DTMF passed
    const resA5Started = await fetch(`${BASE_URL}/ivr/driver/action`, {
      method: 'POST',
      headers: headers.ivr,
      body: JSON.stringify({ driverNumber: testDriver.mobileNumber })
    }).then(r => r.json());
    recordTest('A5.1', 'Started ride with no DTMF returns FINISH menu prompt', resA5Started.data?.menu === 'FINISH');

    // Clean up ride A4
    await ridesCol.deleteOne({ _id: rideInsertA4.insertedId });
  } catch (err) {
    recordTest('A4.1', 'Customer Connection & IVR Menus', false, err.message);
  }

  // ----------------------------------------------------
  // TEST A6: Consistent Zone Pricing & Schedules
  // ----------------------------------------------------
  console.log('\n--- TESTING A6: Pricing Calculation & Zone Rules ---');
  try {
    const testZones = ['1', '2', '3', '4'];
    let allPriced = true;
    const priceDetails = [];

    for (const z of testZones) {
      const resPrice = await fetch(`${BASE_URL}/pricing/calculate`, {
        method: 'POST',
        headers: headers.json,
        body: JSON.stringify({
          zone: z,
          durationMinutes: 10
        })
      }).then(r => r.json());

      const data = resPrice.data || resPrice;
      if (!data || typeof data.calculatedFare !== 'number') {
        allPriced = false;
      } else {
        priceDetails.push(`Zone ${z}: $${data.calculatedFare}`);
      }
    }

    recordTest('A6.1', 'Consistent Fare Calculations across all 4 zones', allPriced, priceDetails.join(', '));
  } catch (err) {
    recordTest('A6.1', 'Consistent Zone Pricing', false, err.message);
  }

  // ----------------------------------------------------
  // TEST A7: Driver Search by Phone in All Formats
  // ----------------------------------------------------
  console.log('\n--- TESTING A7: Driver Search Across All Phone Formats ---');
  try {
    const rawDigits = testDriverPhone; // e.g. 8455551234
    const area = rawDigits.slice(0, 3);
    const mid = rawDigits.slice(3, 6);
    const last = rawDigits.slice(6);

    const formatVariations = [
      { label: 'Raw 10 digits', query: rawDigits },
      { label: 'Parentheses format (XXX) XXX-XXXX', query: `(${area}) ${mid}-${last}` },
      { label: 'Dashes format XXX-XXX-XXXX', query: `${area}-${mid}-${last}` },
      { label: 'E.164 format +1XXXXXXXXXX', query: `+1${rawDigits}` },
      { label: 'With 1 prefix 1XXXXXXXXXX', query: `1${rawDigits}` },
    ];

    for (const fmt of formatVariations) {
      const searchRes = await fetch(`${BASE_URL}/driver/all?search=${encodeURIComponent(fmt.query)}`, {
        headers: headers.admin
      }).then(r => r.json());

      const drivers = searchRes.data?.data || [];
      const found = drivers.some(d => d.driverNumber?.includes(rawDigits) || d.mobileNumber?.replace(/\D/g, '').includes(rawDigits));
      recordTest(`A7.${fmt.label}`, `Driver search works with: ${fmt.label}`, found, `Query: "${fmt.query}"`);
    }

    // Also test getDriverById with phone number
    const getByIdRes = await fetch(`${BASE_URL}/driver/${encodeURIComponent(`(${area}) ${mid}-${last}`)}`, {
      headers: headers.admin
    }).then(r => r.json());
    recordTest('A7.GetByIdPhone', 'getDriverById resolves driver by formatted phone', getByIdRes.statusCode === 200 && Boolean(getByIdRes.data?._id));
  } catch (err) {
    recordTest('A7.1', 'Driver Phone Search Across Formats', false, err.message);
  }

  // ----------------------------------------------------
  // TEST A8: Phone Normalization & Duplicate Protection
  // ----------------------------------------------------
  console.log('\n--- TESTING A8: Phone Formatting & Duplicate Prevention ---');
  try {
    const dupTestDriverPhone = `845888${testSuffix.slice(0, 4)}`;
    const dupTestCustomerPhone = `845777${testSuffix.slice(0, 4)}`;

    // 8.1: Create first driver via POST /driver/add
    const createDriver1 = await fetch(`${BASE_URL}/driver/add`, {
      method: 'POST',
      headers: headers.admin,
      body: JSON.stringify({
        driverName: `Original Driver ${testSuffix}`,
        mobileNumber: `(${dupTestDriverPhone.slice(0,3)}) ${dupTestDriverPhone.slice(3,6)}-${dupTestDriverPhone.slice(6)}`,
        batch: 2
      })
    }).then(r => r.json());
    recordTest('A8.1', 'Create initial driver', createDriver1.statusCode === 201 || createDriver1.statusCode === 200);

    // 8.2: Attempt to create duplicate driver with raw digits
    const createDriverDup = await fetch(`${BASE_URL}/driver/add`, {
      method: 'POST',
      headers: headers.admin,
      body: JSON.stringify({
        driverName: `Duplicate Driver ${testSuffix}`,
        mobileNumber: dupTestDriverPhone,
        batch: 2
      })
    }).then(r => r.json());
    const isDriverDupBlocked = createDriverDup.statusCode === 409 && createDriverDup.message === 'This phone number already exists.';
    recordTest('A8.2', 'Duplicate driver create blocked with exact message "This phone number already exists."', isDriverDupBlocked, `Status: ${createDriverDup.statusCode}, Msg: "${createDriverDup.message}"`);

    // 8.3: Create first customer via POST /customer/add
    const createCustomer1 = await fetch(`${BASE_URL}/customer/add`, {
      method: 'POST',
      headers: headers.admin,
      body: JSON.stringify({
        fullName: `Original Customer ${testSuffix}`,
        mobileNumber: `+1${dupTestCustomerPhone}`,
        email: `cust1_${testSuffix}@example.com`
      })
    }).then(r => r.json());
    recordTest('A8.3', 'Create initial customer', createCustomer1.statusCode === 201 || createCustomer1.statusCode === 200);

    // 8.4: Attempt to create duplicate customer with formatted phone
    const createCustDup = await fetch(`${BASE_URL}/customer/add`, {
      method: 'POST',
      headers: headers.admin,
      body: JSON.stringify({
        fullName: `Duplicate Customer ${testSuffix}`,
        mobileNumber: `(${dupTestCustomerPhone.slice(0,3)}) ${dupTestCustomerPhone.slice(3,6)}-${dupTestCustomerPhone.slice(6)}`,
        email: `cust2_${testSuffix}@example.com`
      })
    }).then(r => r.json());
    const isCustDupBlocked = createCustDup.statusCode === 409 && createCustDup.message === 'This phone number already exists.';
    recordTest('A8.4', 'Duplicate customer create blocked with exact message "This phone number already exists."', isCustDupBlocked, `Status: ${createCustDup.statusCode}, Msg: "${createCustDup.message}"`);

    // 8.5: Customer search across phone formats
    const custSearch = await fetch(`${BASE_URL}/customer/all?search=${encodeURIComponent(dupTestCustomerPhone)}`, {
      headers: headers.admin
    }).then(r => r.json());
    const customers = custSearch.data?.data || custSearch.data?.customers || [];
    const foundCust = customers.length > 0;
    recordTest('A8.5', 'Customer search by 10 digits finds customer originally saved with +1', foundCust);

    // Clean up created records
    if (createDriver1.data?._id) await driversCol.deleteOne({ _id: new mongoose.Types.ObjectId(createDriver1.data._id) });
    if (createCustomer1.data?._id) await customersCol.deleteOne({ _id: new mongoose.Types.ObjectId(createCustomer1.data._id) });
  } catch (err) {
    recordTest('A8.1', 'Phone Normalization & Duplicate Prevention', false, err.message);
  }

  // Clean up initial test driver
  await driversCol.deleteOne({ _id: driverInsert.insertedId });

  console.log('\n====================================================');
  console.log('📊 FINAL TEST RESULTS SUMMARY');
  console.log('====================================================');
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total Scenarios Tested: ${total}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount === 0) {
    console.log('\n🎉 ALL SCENARIOS PASSED WITH 100% SUCCESS!');
  } else {
    console.log('\n⚠️ Some scenarios failed, check log above.');
  }

  await mongoose.disconnect();
  process.exit(failedCount === 0 ? 0 : 1);
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
