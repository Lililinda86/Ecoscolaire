const CAMPAY_BASE_URL_SANDBOX = process.env.CAMPAY_SANDBOX_URL || "https://demo.campay.net";
const CAMPAY_BASE_URL_PRODUCTION = process.env.CAMPAY_PRODUCTION_URL || "https://campay.net";

export class CampayService {
  private baseUrl: string;

  constructor(isSandbox: boolean = true) {
    this.baseUrl = isSandbox ? CAMPAY_BASE_URL_SANDBOX : CAMPAY_BASE_URL_PRODUCTION;
    console.log(`[CampayService] Initialized for environment: ${isSandbox ? 'sandbox' : 'production'}`);
  }

  async login(username: string, password: string): Promise<string> {
    const url = `${this.baseUrl}/api/token/`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: response.statusText };
      }
      throw new Error(`Campay login failed [${response.status}]: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    if (!data.token) {
      throw new Error('Campay login response missing token');
    }

    return data.token;
  }

  async requestToPay(
    token: string, 
    amount: number, 
    phoneNumber: string, 
    description: string, 
    externalReference: string
  ): Promise<any> {
    const url = `${this.baseUrl}/api/collect/`;
    
    // Campay API requires amount as string, phone as '237...'
    const payload = {
      amount: amount.toString(),
      from: phoneNumber,
      description: description,
      external_reference: externalReference
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Token ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: response.statusText };
      }
      throw new Error(`Campay requestToPay failed [${response.status}]: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  }

  async getTransactionStatus(token: string, reference: string): Promise<any> {
    const url = `${this.baseUrl}/api/transaction/${reference}/`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Token ${token}`
      }
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: response.statusText };
      }
      throw new Error(`Campay getTransactionStatus failed [${response.status}]: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  }
}
