"use client";

const Header = () => {
  return (
    <div className="bg-[#1e1e1e] shadow-lg mx-4 sm:mx-6 lg:mx-8 mt-4 mb-2 rounded-lg">
      <div className="max-w-7xl py-3 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-semibold text-gray-100 leading-tight">
              People Counting Dashboard
            </h1>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
