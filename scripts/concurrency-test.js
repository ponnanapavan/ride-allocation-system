import axios from "axios";

const BASE_URL = "http://localhost:3000";


const rideId = "019f20e6-699f-756c-b582-6b6254934c63";


const drivers = [
  "019f20bb-1f08-725e-995f-d9feda112d16",
  "019f20bb-6ad6-7638-b51c-92b059bc99c9",
  "019f20bb-9274-77cd-a9e4-48442df5df49",
  "019f20bb-b9a6-7303-8ef9-06a44ee33a79",
  "019f20bb-e470-74ae-b5c9-493de539738e",
];

async function simulateConcurrentAccept() {
  console.log("Starting concurrency test...\n");

  const requests = drivers.map((driverId) =>
    axios
      .post(`${BASE_URL}/rides/${rideId}/accept`, {
        driverId,
      })
      .then((res) => ({
        driverId,
        status: "SUCCESS",
        response: res.data,
      }))
      .catch((err) => ({
        driverId,
        status: "FAILED",
        response: err.response?.data || err.message,
      })),
  );

  const results = await Promise.all(requests);

  console.log("========== RESULTS ==========\n");

  results.forEach((result) => {
    console.log("Driver:", result.driverId);
    console.log("Status:", result.status);
    console.log("Response:", result.response);
    console.log("------------------------------------");
  });
}

simulateConcurrentAccept();