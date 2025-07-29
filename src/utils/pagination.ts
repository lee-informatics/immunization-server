import axios, { AxiosResponse } from 'axios';

export async function fetchAllPages(baseUrl: string, headers: any = {}): Promise<any[]> {
  console.log("-------")
  const allResources: any[] = [];
  let nextUrl: string | null = baseUrl;
  console.log(baseUrl)
  
  // Extract the base URL components for proper URL resolution
  const baseUrlObj = new URL(baseUrl);
  const baseProtocol = baseUrlObj.protocol;
  const baseHost = baseUrlObj.host;
  const basePath = baseUrlObj.pathname;
  
  while (nextUrl) {

    try {
      const response: AxiosResponse = await axios.get(nextUrl, { headers });
      
      if (response.data && response.data.entry) {
        allResources.push(...response.data.entry.map((entry: any) => entry.resource));
      }
      
      // Check for next page link
      const links = response.data?.link || [];
      const nextLink = links.find((link: any) => link.relation === 'next');
      
      if (nextLink && nextLink.url) {
        // Resolve the next URL properly
        let resolvedUrl = nextLink.url;
        
        // If it's a relative URL, resolve it against the base URL
        if (nextLink.url.startsWith('/')) {
          resolvedUrl = `${baseProtocol}//${baseHost}${nextLink.url}`;
        } else if (!nextLink.url.startsWith('http')) {
          // If it's a relative path, resolve it against the base path
          resolvedUrl = `${baseProtocol}//${baseHost}${basePath}${nextLink.url.startsWith('?') ? '' : '/'}${nextLink.url}`;
        }
        
        // Ensure the URL points to the correct FHIR server
        if (resolvedUrl.includes('localhost:3000')) {
          resolvedUrl = resolvedUrl.replace('localhost:3000', baseHost);
        }
        
        nextUrl = resolvedUrl;
      } else {
        nextUrl = null;
      }
      
      // If no next link but we have a searchset, check if there are more results
      if (!nextUrl && response.data?.resourceType === 'Bundle' && response.data?.total) {
        const currentCount = allResources.length;
        const total = response.data.total;
        if (currentCount < total) {
          // Construct next URL with _count and _getpagesoffset using baseUrl
          const url = new URL(baseUrl);
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