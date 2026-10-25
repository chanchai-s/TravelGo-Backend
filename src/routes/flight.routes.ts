import {Router} from 'express';
import {getDestination} from '../controllers/flight.controllers'


const flightRoutes = Router(); 

flightRoutes.get('/search',getDestination);

export default flightRoutes