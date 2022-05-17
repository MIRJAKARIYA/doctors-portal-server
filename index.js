const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mnxyi.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res
      .status(401)
      .send({ authorization: false, message: "Unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(403)
        .send({ authorization: false, message: "Forbidded access" });
    }
    req.decoded = decoded;
    next();
  });
};

const run = async () => {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctors_portal")
      .collection("services");
    const bookingCollection = client
      .db("doctors_portal")
      .collection("bookings");
    const userCollection = client.db("doctors_portal").collection("users");
    const doctorCollection = client.db("doctors_portal").collection("doctors");



    //verify admin middleware
    const verifyAdmin = async(req, res, next) =>{
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email:requester});
      if(requesterAccount.role === 'admin'){
        next()
      }
      else{
        res.status(403).send({message:'forbidden'});
      }
    }



    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({name:1});
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get("/allUsers", verifyToken, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get('/admin/:email', async(req,res)=>{
      const email = req.params.email;
      const user = await userCollection.findOne({email:email});
      const isAdmin = user.role === 'admin';
      res.send({admin:isAdmin});
    })

    app.put("/user/admin/:email", verifyToken,verifyAdmin, async (req, res) => {
      const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        {
          expiresIn: "1h",
        }
      );
      res.send({ result, token });
    });

    //this is not the proper way to query
    //after learning more about mongodb. use aggregate lookup, pipeline, match, group
    app.get("/available", async (req, res) => {
      const date = req.query.date;

      //step 1: get all services

      const services = await serviceCollection.find().toArray();

      //step 2: get the booking of that day.output [{},{},{},{}]

      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      //step 3: for each service, find bookings for that service
      services.forEach((service) => {
        //step 4: find bookings for that service. output [{},{},{},{}]
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        //step 5: select slots for the service bookings:['','','']
        const bookedSlots = serviceBookings.map((booking) => booking.slot);
        //step 6: select those slots that are not in booked slots
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        //step 7: set available to slots to make it easier
        service.slots = available;
      });

      res.send(services);
    });

    /*
     *API Naming Convention
     *app.get('/booking')   //get all bookings in this collection or get more than one or by filter
     *app.get('/booking/:id')  //get a specific booking
     *app.post('/booking')   //add a new booking
     *app.patch('/booking/:id')  //
     *app.put('/booking/:id') // upsert ==> update(if exists) or insert (if doesn't exist)
     *app.delete('/booking/:id')  //
     */
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        patient: booking.patient,
        date: booking.date,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send({ success: true, result });
    });
    app.get("/booking", verifyToken, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (decodedEmail === patient) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }
      res
        .status(403)
        .send({ authorization: false, message: "Forbidden access" });
    });
    //add doctor
    app.post('/doctor', verifyToken,verifyAdmin, async(req, res)=>{
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    //get all doctors
    app.get('/doctors', verifyToken, verifyAdmin, async(req, res) =>{
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    })

    //delete doctor
    app.delete('/doctor/:email', verifyToken, verifyAdmin, async(req, res)=>{
      const email = req.params.email;
      const filter = {email:email}
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    })

  } finally {
  }
};

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello From Doctor Uncle");
});

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`);
});
