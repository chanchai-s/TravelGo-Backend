import { Request, Response } from "express";
import { searchDestination } from "../services/flight.services";


export async function getDestination(req:Request, res: Response) {
    const query = req.query.query as string; 

    if(!query){
        return res.status(400).json({
            status : false,
            message: 'Missing query string'
        });
    }

    try {
        const result = await searchDestination(query);
        return res.status(200).json({
            status: true,
            message: 'Success',
            data: result
        });
    } catch (error : any) {
        return res.status(500).json({
            status: false,
            message: 'Internal server error while searching destination.',
            error: error.message
        })
    }
}