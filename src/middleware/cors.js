import cors from "cors";

const app = express();
app.use(cors()); // Дозволити всі джерела (для розробки)