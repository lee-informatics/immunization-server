import axios, { AxiosResponse } from 'axios';

export async function fetchAllPages(baseUrl: string, headers: any = {}): Promise<any[]> {
  const allResources: any[] = [];
  let nextUrl: string | null = baseUrl;
  
  while (nextUrl) {
    try {
      const response: AxiosResponse = await axios.get(nextUrl, { headers });
      
      if (response.data && response.data.entry) {
        allResources.push(...response.data.entry.map((entry: any) => entry.resource));
      }
      
      // Check for next page link
      const links = response.data?.link || [];
      const nextLink = links.find((link: any) => link.relation === 'next');
      nextUrl = nextLink ? nextLink.url : null;
      
      // If no next link but we have a searchset, check if there are more results
      if (!nextUrl && response.data?.resourceType === 'Bundle' && response.data?.total) {
        const currentCount = allResources.length;
        const total = response.data.total;
        if (currentCount < total) {
          // Construct next URL with _count and _getpagesoffset
          const url = new URL(nextUrl || baseUrl);
          url.searchParams.set('_count', '100');
          url.searchParams.set('_getpagesoffset', currentCount.toString());
          nextUrl = url.toString();
        }
      }
    } catch (error) {
      console.error('Error fetching page:', error);
      break;
    }
  }
  
  return allResources;
}