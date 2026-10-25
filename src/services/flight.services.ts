import axios from 'axios'; 

export interface FlightLocation{
    id: string;
    name: string; 
    code: string;
    country: string; 
    type: string; 
}

export interface FlightResponse {
    status: boolean;
    message :string; 
    data : FlightLocation[]
}

export async function searchDestination(query: string) {
  const options = {
    method: 'GET',
    url: 'https://booking-com15.p.rapidapi.com/api/v1/flights/searchDestination',
    params: { query: query },
    headers: {
      'x-rapidapi-key': 'd3137d4345msh110fbcb51e3c0c5p1861e6jsne0393e4a1671',
      'x-rapidapi-host': 'booking-com15.p.rapidapi.com'
    }
  };

  try {
    const response = await axios.request(options);
    return response.data;
  } catch (error: any) {
    console.error('Error fetching data:', error.response?.data || error.message);
    throw error;
  }
}
