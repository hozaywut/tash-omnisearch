import Fuse from "fuse.js";
type ResultType = "performer" | "scene" | "tag" | "system";

interface Result {
  id: string; // number as string or string
  type: ResultType;
  label: string;
  details?: string;
}
interface SystemResult extends Result {
  type: "system";
  url: string;
}
type GQLResult = Record<string, any>;

const settingsTabs = ["tasks", "plugins", "interface", "security", "stats"];
const pages = [
  "scenes",
  "images",
  "movies",
  "markers",
  "galleries",
  "performers",
  "tags",
  "studios",
];

// how many we will request from the server
const maxResultsPerEntity = 10;

// how many we will display
const maxResultsDisplayed = 10;

const body = document.body;

// new div for the omnisearch
const omnisearch = document.createElement("div");
omnisearch.id = "omnisearch";
body.appendChild(omnisearch);

// add backdrop
const backdrop = document.createElement("div");
backdrop.classList.add("omnisearch-backdrop");
backdrop.addEventListener("click", () => {
  // remove visible class from the omnisearch
  omnisearch.classList.remove("visible");
  searchInput.blur();
  searchInput.value = "";
});
omnisearch.appendChild(backdrop);

// create the search input
const searchInput = document.createElement("input");
searchInput.id = "omnisearch-search-input";
searchInput.classList.add("omnisearch-input");
searchInput.type = "text";
searchInput.placeholder = "⌘ + / ";
omnisearch.appendChild(searchInput);

// create the search results container
const searchResults = document.createElement("div");
searchResults.id = "search-results";
searchResults.classList.add("omnisearch-results");
omnisearch.appendChild(searchResults);

const debounce = (func: (args: any) => void, delay: number) => {
  let timeout: number;
  return (...args: any) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(args), delay);
  };
};
console.log("workrrr");
async function searchAndDisplay(e: InputEvent): Promise<void> {
  const results: Result[] = await comboGqlFetch(searchInput.value);
  let allResults: Result[] = [];
  // stash pages
  allResults = allResults.concat(
    pages.map((page) => ({
      id: page,
      label: page,
      url: "/" + page,
      type: "system",
    }))
  );

  // stash settings tabs
  allResults = allResults.concat(
    settingsTabs.map((tab) => ({
      id: tab,
      label: "settings -> " + tab,
      url: "/settings?tab=" + tab,
      type: "system",
    }))
  );

  // add combo results
  allResults = allResults.concat(results);

  // lets fuzzy the results to get a bit more accurate
  const fuse = new Fuse(allResults, {
    keys: [
      {
        name: "label",
        weight: 10,
      },
      {
        name: "aliases",
        weight: 5,
      },
      {
        name: "details",
        weight: 1,
      },
    ],
    shouldSort: true,
    threshold: 0.4,
  });

  // limit results
  allResults = fuse
    .search(searchInput.value, { limit: maxResultsDisplayed })
    .map((r) => r.item);

  // display results
  displayResults(allResults.sort((a, b) => a.label.localeCompare(b.label)));
}

searchInput.addEventListener(
  "input",
  debounce((e: InputEvent) => searchAndDisplay(e), 100)
); // Adjust the delay as needed

document.addEventListener("keydown", (e) => {
  // on cmd + / , focus the search input
  if (e.key === "/" && e.metaKey) {
    // add visible class to the omnisearch
    omnisearch.classList.add("visible");
    searchInput.focus();
    // on escape, unfocus the search input and clear it
  } else if (e.key === "Escape") {
    // remove visible class from the omnisearch
    omnisearch.classList.remove("visible");
    searchInput.blur();
    searchInput.value = "";
  }
});

const openResult = (result: Result) => {
  const searchTypes: ResultType[] = ["performer", "scene", "tag"];
  if (result.type === "system")
    return (window.location.href = (result as SystemResult).url);
  else if (!searchTypes.includes(result.type)) return;
  window.location.href = `/${result.type}s/${result.id}`;
};

const createResult = (result: Result) => {
  const resultDiv = document.createElement("div");
  resultDiv.classList.add("omnisearch-result");
  resultDiv.addEventListener("click", (e) => openResult(result));

  // support tabbing
  resultDiv.tabIndex = 0;

  // support enter key
  resultDiv.addEventListener(
    "keydown",
    (e) => e.key === "Enter" && openResult(result)
  );

  const resultType = document.createElement("div");
  resultType.classList.add("omnisearch-result-type");
  resultType.textContent = "[" + result.type[0] + "]";
  resultDiv.appendChild(resultType);

  const resultTitle = document.createElement("div");
  resultTitle.classList.add("omnisearch-result-title");
  resultTitle.textContent = result.label;
  resultDiv.appendChild(resultTitle);

  const resultDetails = document.createElement("div");
  resultDetails.classList.add("omnisearch-result-details");
  resultDetails.textContent = result?.details ? result.details : "";
  resultDiv.appendChild(resultDetails);

  return resultDiv;
};

const displayResults = (results: Result[]) => {
  searchResults.innerHTML = "";
  results.forEach((result) => {
    searchResults.appendChild(createResult(result));
  });
};

const gqlFetch = (
  query: string,
  variables: Record<string, any>
): Promise<Record<string, any>> =>
  fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      variables,
      query,
    }),
  })
    .then((d) => d.json())
    .then((d) => d.data);

const comboGqlFetch = async (term: string): Promise<Result[]> => {
  const searchTerm = term.trim().replace("/", "");
  const tagFilter = {
    sort: "name",
    direction: "ASC",
  };
  const performerFilter = {
    sort: "rating",
    direction: "DESC",
  };
  const sceneFilter = {
    sort: "created_at",
    direction: "DESC",
  };
  const query =
    "query FindMatches( $performer_filter: FindFilterType $tag_filter: FindFilterType $scene_filter: FindFilterType) { findPerformers(filter: $performer_filter) { count performers { id name details disambiguation alias_list }} findTags(filter: $tag_filter) { count tags { id name aliases }} findScenes(filter: $scene_filter) { count scenes { id title files details { path }}}}";
  const defaultFilters = {
    q: searchTerm,
    page: 1,
    per_page: maxResultsPerEntity,
  };
  const filters = {
    performer_filter: {
      ...defaultFilters,
      ...performerFilter,
    },
    tag_filter: {
      ...defaultFilters,
      ...tagFilter,
    },
    scene_filter: {
      ...defaultFilters,
      ...sceneFilter,
    },
  };
  const result = await gqlFetch(query, filters);
  const tags = result.findTags.tags.map((t: GQLResult) => ({
    id: t.id,
    type: "tag",
    label: t.name,
    aliases: t.aliases,
    details: "",
  }));
  const performers = result.findPerformers.performers.map((p: GQLResult) => ({
    id: p.id,
    type: "performer",
    label: p.name,
    aliases: [...p.alias_list, p.disambiguation],
    details: "",
  }));
  const scenes = result.findScenes.scenes.map((s: GQLResult) => ({
    id: s.id,
    type: "scene",
    label: s.title || s.files[0].path,
    aliases: "",
    details: s.details,
  }));
  return [...tags, ...performers, ...scenes];
};
